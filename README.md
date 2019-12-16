These are steps to create a basic CRUD app.

Concepts:

- Databases -> Tables -> Data
- Migration -> Test

Database is referenced in .env, so that value is the primary dependency. Everything else should run as long as there is a valid DATABASE_URL there.

Migrations Debugging:  
You have to delete the tables manually in the database if you try to change the migration files. The schemaversion thing messes it up.

## Commands for Usage

```
npm run migrate:test
npm test
```

## Step 1: Setup Postgres Database

Start postgres:

```
postgres
```

In a new terminal tab, create the base + test databases:

```
createdb -U <user> <database>
createdb -U dunder_mifflin blogful-2
createdb -U dunder_mifflin blogful-2-test
```

Add the Database URLs to the .env

```
DATABASE_URL="postgresql://dunder_mifflin@localhost/blogful-2"
TEST_DATABASE_URL="postgresql://dunder_mifflin@localhost/blogful-2-test"
```

## Step 2: Setup Server

Dependencies

```
npm i express morgan cors dotenv helmet mocha chai supertest
npm install knex
npm install postgrator-cli --save-dev
npm i pg
npm i xss
npm init -y
```

Create Files

```
echo "node_modules" > .gitignore
echo ".env" >> .gitignore
echo "NODE_ENV=development" > .env
echo "PORT=8000" >> .env
echo "web: node src/server.js" > Procfile
touch postgrator-config.js
mkdir src
touch src/app.js
touch src/server.js
touch src/config.js
mkdir migrations
touch migrations/001.do.create_blogful_examples.sql
touch migrations/001.undo.create_blogful_examples.sql
touch migrations/002.do.alter_example_style.sql
touch migrations/002.undo.alter_example_style.sql
mkdir seeds
touch seed.blogful_examples.sql
mkdir test
touch test/app.spec.js
touch test/examples-endpoints.spec.js
touch test/examples.fixtures.js
mkdir src/examples
touch src/examples/examples-router.js
touch src/examples/examples-service.js
```

## Step 3: Initial File States

We need the Postgres DATABASE_URL and a TEST_DATABASE_URL.  
That's the key dependency.

An example:

```env
DATABASE_URL="postgresql://dunder_mifflin@localhost/blogful"
TEST_DATABASE_URL="postgresql://dunder_mifflin@localhost/blogful-test"
```

## ./

### postgrator-config.js

```js
require('dotenv').config();

module.exports = {
  migrationsDirectory: 'migrations',
  driver: 'pg',
  connectionString:
    process.env.NODE_ENV === 'test'
      ? process.env.TEST_DATABASE_URL
      : process.env.DATABASE_URL,
  ssl: !!process.env.SSL
};
```

### package.json

```json
  "scripts": {
    "test": "mocha",
    "dev": "nodemon src/server.js",
    "migrate": "postgrator --config postgrator-config.js",
    "migrate:test": "env NODE_ENV=test npm run migrate",
    "migrate:production": "env SSL=true DATABASE_URL=$(heroku config:get DATABASE_URL) npm run migrate",
    "start": "node src/server.js",
    "predeploy": "npm audit && npm run migrate:production",
    "deploy": "git push heroku master"
  },
```

## ./src/

### src/app.js

```js
const express = require('express');
const morgan = require('morgan');
const cors = require('cors');
const helmet = require('helmet');
const { NODE_ENV } = require('./config');

const examplesRouter = require('./examples/examples-router');

const app = express();

app.use(
  morgan(NODE_ENV === 'production' ? 'tiny' : 'common', {
    skip: () => NODE_ENV === 'test'
  })
);
app.use(cors());
app.use(helmet());

app.use('/api/examples', examplesRouter);

app.get('/', (req, res) => {
  res.send('Hello, world!');
});

app.use(function errorHandler(error, req, res, next) {
  let response;
  if (NODE_ENV === 'production') {
    response = { error: 'server error' };
  } else {
    console.error(error);
    response = { error: error.message, details: error };
  }
  res.status(500).json(response);
});

module.exports = app;
```

### src/config.js

```js
module.exports = {
  PORT: process.env.PORT || 8000,
  NODE_ENV: process.env.NODE_ENV || 'development',
  DATABASE_URL:
    process.env.DATABASE_URL || 'postgresql://dunder_mifflin@localhost/blogful',
  TEST_DATABASE_URL:
    process.env.TEST_DATABASE_URL ||
    'postgresql://dunder_mifflin@localhost/blogful-test'
};
```

### src/server.js

```js
require('dotenv').config();
const knex = require('knex');
const app = require('./app');
const { PORT, DATABASE_URL } = require('./config');

const db = knex({
  client: 'pg',
  connection: DATABASE_URL
});

app.set('db', db);

app.listen(PORT, () => {
  console.log(`Server listening at http://localhost:${PORT}`);
});
```

### src/examples/examples-router.js

```js
const path = require('path');
const express = require('express');
const xss = require('xss');
const ExamplesService = require('./examples-service');

const examplesRouter = express.Router();
const jsonParser = express.json();

const serializeExample = example => ({
  id: example.id,
  style: example.style,
  title: xss(example.title),
  content: xss(example.content),
  date_published: example.date_published,
  author: example.author
});

examplesRouter
  .route('/')
  .get((req, res, next) => {
    ExamplesService.getAllExamples(req.app.get('db'))
      .then(examples => {
        res.json(examples);
      })
      .catch(next);
  })
  .post(jsonParser, (req, res, next) => {
    const { title, content, style, author } = req.body;
    const newExample = { title, content, style };

    for (const [key, value] of Object.entries(newExample)) {
      // eslint-disable-next-line eqeqeq
      if (value == null) {
        return res.status(400).json({
          error: { message: `Missing '${key}' in request body` }
        });
      }
    }
    newExample.author = author;
    ExamplesService.insertExample(req.app.get('db'), newExample)
      .then(example => {
        res
          .status(201)
          .location(path.posix.join(req.originalUrl, `/${example.id}`));
        res.json(serializeExample(example));
      })
      .catch(next);
  });

examplesRouter
  .route('/:example_id')
  .all((req, res, next) => {
    ExamplesService.getById(req.app.get('db'), req.params.example_id)
      .then(example => {
        if (!example) {
          return res.status(404).json({
            error: { message: "Example doesn't exist" }
          });
        }
        res.example = example; // save the example for the next middleware
        next(); // don't forget to call next so the next middleware happens!
      })
      .catch(next);
  })
  .get((req, res, next) => {
    res.json(serializeExample(res.example));
  })
  .delete((req, res, next) => {
    ExamplesService.deleteExample(req.app.get('db'), req.params.example_id)
      .then(() => {
        res.status(204).end();
      })
      .catch(next);
  })
  .patch(jsonParser, (req, res, next) => {
    const { title, content, style } = req.body;
    const exampleToUpdate = { title, content, style };

    const numberOfValues = Object.values(exampleToUpdate).filter(Boolean)
      .length;
    if (numberOfValues === 0) {
      return res.status(400).json({
        error: {
          message:
            "Request body must contain either 'title', 'style' or 'content'"
        }
      });
    }

    ExamplesService.updateExample(
      req.app.get('db'),
      req.params.example_id,
      exampleToUpdate
    )
      .then(numRowsAffected => {
        res.status(204).end();
      })
      .catch(next);
  });

module.exports = examplesRouter;
```

### examples/examples-service.js

```js
const ExamplesService = {
  getAllExamples(knex) {
    return knex.select('*').from('blogful_examples');
  },
  insertExample(knex, newExample) {
    return knex
      .insert(newExample)
      .into('blogful_examples')
      .returning('*')
      .then(rows => {
        return rows[0];
      });
  },
  getById(knex, id) {
    return knex
      .from('blogful_examples')
      .select('*')
      .where('id', id)
      .first();
  },
  deleteExample(knex, id) {
    return knex('blogful_examples')
      .where({ id })
      .delete();
  },
  updateExample(knex, id, newExampleFields) {
    return knex('blogful_examples')
      .where({ id })
      .update(newExampleFields);
  }
};

module.exports = ExamplesService;
```

## ./migrations/

### ./migrations/001.do.create_blogful_examples.sql

```sql
CREATE TABLE blogful_examples (
  id INTEGER PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY,
  title TEXT NOT NULL,
  content TEXT,
  date_published TIMESTAMP DEFAULT NOW() NOT NULL
);
```

### ./migrations/001.undo.create_blogful_examples.sql

```sql
DROP TABLE IF EXISTS blogful_examples;
```

### ./migrations/002.do.alter_example_style.sql

```sql
CREATE TYPE example_category AS ENUM (
  'Listicle',
  'How-to',
  'News',
  'Interview',
  'Story'
);

ALTER TABLE
  blogful_examples
ADD
  COLUMN style example_category;
```

### ./migations/002.undo.alter_example_style.sql

```sql
ALTER TABLE
  blogful_examples DROP COLUMN IF EXISTS style;

DROP TYPE IF EXISTS example_category;
```

### ./migrations/003.do.create_blogful_users.sql

```sql
CREATE TABLE blogful_users (
  id INTEGER PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY,
  fullname TEXT NOT NULL,
  username TEXT NOT NULL UNIQUE,
  PASSWORD TEXT,
  nickname TEXT,
  date_created TIMESTAMP NOT NULL DEFAULT NOW()
);

ALTER TABLE
  blogful_examples
ADD
  COLUMN author INTEGER REFERENCES blogful_users(id) ON DELETE
SET
  NULL;
```

### ./migrations/003.undo.create_blogful_users.sql

```sql
ALTER TABLE
  blogful_examples DROP COLUMN author;

DROP TABLE IF EXISTS blogful_users;
```

## ./test/

### ./test/app-spec.js

```js
const { expect } = require('chai');
const supertest = require('supertest');
const app = require('../src/app');

describe('App', () => {
  it('GET / responds with 200 "Hello, world!"', () => {
    return supertest(app)
      .get('/')
      .expect(200, 'Hello, world!');
  });
});
```

### ./test/examples-endpoints.spec.js

```js
process.env.TZ = 'UTC';
require('dotenv').config();

const { expect } = require('chai');
const supertest = require('supertest');
const knex = require('knex');
const app = require('../src/app');
const {
  makeExamplesArray,
  makeMaliciousExample
} = require('./examples.fixtures');
const { makeUsersArray } = require('./users.fixtures');

describe('Examples Endpoints', function() {
  let db;

  before('make knex instance', () => {
    db = knex({
      client: 'pg',
      connection: process.env.TEST_DATABASE_URL
    });
    app.set('db', db);
  });

  after('disconnect from db', () => db.destroy());

  before('clean the table', () =>
    db.raw('TRUNCATE blogful_examples, blogful_users RESTART IDENTITY CASCADE')
  );

  afterEach('cleanup', () =>
    db.raw('TRUNCATE blogful_examples, blogful_users RESTART IDENTITY CASCADE')
  );

  describe(`GET /api/examples`, () => {
    context(`Given no examples`, () => {
      it(`responds with 200 and an empty list`, () => {
        return supertest(app)
          .get('/api/examples')
          .expect(200, []);
      });
    });

    context('Given there are examples in the database', () => {
      const testUsers = makeUsersArray();
      const testExamples = makeExamplesArray();

      beforeEach('insert examples', () => {
        return db
          .into('blogful_users')
          .insert(testUsers)
          .then(() => {
            return db.into('blogful_examples').insert(testExamples);
          });
      });

      it('responds with 200 and all of the examples', () => {
        return supertest(app)
          .get('/api/examples')
          .expect(200, testExamples);
      });
    });

    context(`Given an XSS attack example`, () => {
      const testUsers = makeUsersArray();
      const { maliciousExample, expectedExample } = makeMaliciousExample();

      beforeEach('insert malicious example', () => {
        return db
          .into('blogful_users')
          .insert(testUsers)
          .then(() => {
            return db.into('blogful_examples').insert([maliciousExample]);
          });
      });

      it('removes XSS attack content', () => {
        return supertest(app)
          .get(`/api/examples`)
          .expect(200)
          .expect(res => {
            expect(res.body[0].title).to.eql(expectedExample.title);
            expect(res.body[0].content).to.eql(expectedExample.content);
          });
      });
    });
  });

  describe(`GET /api/examples/:example_id`, () => {
    context(`Given no examples`, () => {
      it(`responds with 404`, () => {
        const exampleId = 123456;
        return supertest(app)
          .get(`/api/examples/${exampleId}`)
          .expect(404, { error: { message: `Example doesn't exist` } });
      });
    });

    context('Given there are examples in the database', () => {
      const testUsers = makeUsersArray();
      const testExamples = makeExamplesArray();

      beforeEach('insert examples', () => {
        return db
          .into('blogful_users')
          .insert(testUsers)
          .then(() => {
            return db.into('blogful_examples').insert(testExamples);
          });
      });

      it('responds with 200 and the specified example', () => {
        const exampleId = 2;
        const expectedExample = testExamples[exampleId - 1];
        return supertest(app)
          .get(`/api/examples/${exampleId}`)
          .expect(200, expectedExample);
      });
    });

    context(`Given an XSS attack example`, () => {
      const testUsers = makeUsersArray();
      const { maliciousExample, expectedExample } = makeMaliciousExample();

      beforeEach('insert malicious example', () => {
        return db
          .into('blogful_users')
          .insert(testUsers)
          .then(() => {
            return db.into('blogful_examples').insert([maliciousExample]);
          });
      });

      it('removes XSS attack content', () => {
        return supertest(app)
          .get(`/api/examples/${maliciousExample.id}`)
          .expect(200)
          .expect(res => {
            expect(res.body.title).to.eql(expectedExample.title);
            expect(res.body.content).to.eql(expectedExample.content);
          });
      });
    });
  });

  describe(`POST /api/examples`, () => {
    const testUsers = makeUsersArray();
    beforeEach('insert malicious example', () => {
      return db.into('blogful_users').insert(testUsers);
    });

    it(`creates an example, responding with 201 and the new example`, () => {
      const newExample = {
        title: 'Test new example',
        style: 'Listicle',
        content: 'Test new example content...'
      };
      return supertest(app)
        .post('/api/examples')
        .send(newExample)
        .expect(201)
        .expect(res => {
          expect(res.body.title).to.eql(newExample.title);
          expect(res.body.style).to.eql(newExample.style);
          expect(res.body.content).to.eql(newExample.content);
          expect(res.body).to.have.property('id');
          expect(res.headers.location).to.eql(`/api/examples/${res.body.id}`);
          const expected = new Intl.DateTimeFormat('en-US').format(new Date());
          const actual = new Intl.DateTimeFormat('en-US').format(
            new Date(res.body.date_published)
          );
          expect(actual).to.eql(expected);
        })
        .then(res =>
          supertest(app)
            .get(`/api/examples/${res.body.id}`)
            .expect(res.body)
        );
    });

    const requiredFields = ['title', 'style', 'content'];

    requiredFields.forEach(field => {
      const newExample = {
        title: 'Test new example',
        style: 'Listicle',
        content: 'Test new example content...'
      };

      it(`responds with 400 and an error message when the '${field}' is missing`, () => {
        delete newExample[field];

        return supertest(app)
          .post('/api/examples')
          .send(newExample)
          .expect(400, {
            error: { message: `Missing '${field}' in request body` }
          });
      });
    });

    it('removes XSS attack content from response', () => {
      const { maliciousExample, expectedExample } = makeMaliciousExample();
      return supertest(app)
        .post(`/api/examples`)
        .send(maliciousExample)
        .expect(201)
        .expect(res => {
          expect(res.body.title).to.eql(expectedExample.title);
          expect(res.body.content).to.eql(expectedExample.content);
        });
    });
  });

  describe(`DELETE /api/examples/:example_id`, () => {
    context(`Given no examples`, () => {
      it(`responds with 404`, () => {
        const exampleId = 123456;
        return supertest(app)
          .delete(`/api/examples/${exampleId}`)
          .expect(404, { error: { message: `Example doesn't exist` } });
      });
    });

    context('Given there are examples in the database', () => {
      const testUsers = makeUsersArray();
      const testExamples = makeExamplesArray();

      beforeEach('insert examples', () => {
        return db
          .into('blogful_users')
          .insert(testUsers)
          .then(() => {
            return db.into('blogful_examples').insert(testExamples);
          });
      });

      it('responds with 204 and removes the example', () => {
        const idToRemove = 2;
        const expectedExamples = testExamples.filter(
          example => example.id !== idToRemove
        );
        return supertest(app)
          .delete(`/api/examples/${idToRemove}`)
          .expect(204)
          .then(res =>
            supertest(app)
              .get(`/api/examples`)
              .expect(expectedExamples)
          );
      });
    });
  });

  describe(`PATCH /api/examples/:example_id`, () => {
    context(`Given no examples`, () => {
      it(`responds with 404`, () => {
        const exampleId = 123456;
        return supertest(app)
          .delete(`/api/examples/${exampleId}`)
          .expect(404, { error: { message: `Example doesn't exist` } });
      });
    });

    context('Given there are examples in the database', () => {
      const testUsers = makeUsersArray();
      const testExamples = makeExamplesArray();

      beforeEach('insert examples', () => {
        return db
          .into('blogful_users')
          .insert(testUsers)
          .then(() => {
            return db.into('blogful_examples').insert(testExamples);
          });
      });

      it('responds with 204 and updates the example', () => {
        const idToUpdate = 2;
        const updateExample = {
          title: 'updated example title',
          style: 'Interview',
          content: 'updated example content'
        };
        const expectedExample = {
          ...testExamples[idToUpdate - 1],
          ...updateExample
        };
        return supertest(app)
          .patch(`/api/examples/${idToUpdate}`)
          .send(updateExample)
          .expect(204)
          .then(res =>
            supertest(app)
              .get(`/api/examples/${idToUpdate}`)
              .expect(expectedExample)
          );
      });

      it(`responds with 400 when no required fields supplied`, () => {
        const idToUpdate = 2;
        return supertest(app)
          .patch(`/api/examples/${idToUpdate}`)
          .send({ irrelevantField: 'foo' })
          .expect(400, {
            error: {
              message: `Request body must contain either 'title', 'style' or 'content'`
            }
          });
      });

      it(`responds with 204 when updating only a subset of fields`, () => {
        const idToUpdate = 2;
        const updateExample = {
          title: 'updated example title'
        };
        const expectedExample = {
          ...testExamples[idToUpdate - 1],
          ...updateExample
        };

        return supertest(app)
          .patch(`/api/examples/${idToUpdate}`)
          .send({
            ...updateExample,
            fieldToIgnore: 'should not be in GET response'
          })
          .expect(204)
          .then(res =>
            supertest(app)
              .get(`/api/examples/${idToUpdate}`)
              .expect(expectedExample)
          );
      });
    });
  });
});
```

### test/examples.fixtures.js

```js
function makeExamplesArray() {
  return [
    {
      id: 1,
      date_published: '2029-01-22T16:28:32.615Z',
      title: 'First test post!',
      style: 'How-to',
      content:
        'Lorem ipsum dolor sit amet, consectetur adipisicing elit. Natus consequuntur deserunt commodi, nobis qui inventore corrupti iusto aliquid debitis unde non.Adipisci, pariatur.Molestiae, libero esse hic adipisci autem neque ?',
      author: 1
    },
    {
      id: 2,
      date_published: '2100-05-22T16:28:32.615Z',
      title: 'Second test post!',
      style: 'News',
      content:
        'Lorem ipsum dolor sit amet consectetur adipisicing elit. Cum, exercitationem cupiditate dignissimos est perspiciatis, nobis commodi alias saepe atque facilis labore sequi deleniti. Sint, adipisci facere! Velit temporibus debitis rerum.',
      author: 2
    },
    {
      id: 3,
      date_published: '1919-12-22T16:28:32.615Z',
      title: 'Third test post!',
      style: 'Listicle',
      content:
        'Lorem ipsum dolor sit amet, consectetur adipisicing elit. Possimus, voluptate? Necessitatibus, reiciendis? Cupiditate totam laborum esse animi ratione ipsa dignissimos laboriosam eos similique cumque. Est nostrum esse porro id quaerat.',
      author: 1
    },
    {
      id: 4,
      date_published: '1919-12-22T16:28:32.615Z',
      title: 'Fourth test post!',
      style: 'Story',
      content:
        'Lorem ipsum dolor sit amet consectetur adipisicing elit. Earum molestiae accusamus veniam consectetur tempora, corporis obcaecati ad nisi asperiores tenetur, autem magnam. Iste, architecto obcaecati tenetur quidem voluptatum ipsa quam?',
      author: 1
    }
  ];
}

function makeMaliciousExample() {
  const maliciousExample = {
    id: 911,
    style: 'How-to',
    date_published: new Date().toISOString(),
    title: 'Naughty naughty very naughty <script>alert("xss");</script>',
    content: `Bad image <img src="https://url.to.file.which/does-not.exist" onerror="alert(document.cookie);">. But not <strong>all</strong> bad.`,
    author: 1
  };
  const expectedExample = {
    ...maliciousExample,
    title:
      'Naughty naughty very naughty &lt;script&gt;alert("xss");&lt;/script&gt;',
    content: `Bad image <img src="https://url.to.file.which/does-not.exist">. But not <strong>all</strong> bad.`
  };
  return {
    maliciousExample,
    expectedExample
  };
}

module.exports = {
  makeExamplesArray,
  makeMaliciousExample
};
```

### test/users.fixtures.js

```js
'use strict';

function makeUsersArray() {
  return [
    {
      id: 1,
      date_created: '2029-01-22T16:28:32.615Z',
      fullname: 'Sam Gamgee',
      username: 'sam.gamgee@shire.com',
      password: 'secret',
      nickname: 'Sam'
    },
    {
      id: 2,
      date_created: '2100-05-22T16:28:32.615Z',
      fullname: 'Peregrin Took',
      username: 'peregrin.took@shire.com',
      password: 'secret',
      nickname: 'Pippin'
    }
  ];
}

module.exports = {
  makeUsersArray
};
```

## ./seeds/

### ./seeds/seed.blogful_examples.sql

```sql
INSERT INTO
  blogful_examples (title, style, content)
VALUES
  (
    'First post!',
    'Interview',
    'Lorem ipsum dolor sit amet, consectetur adipisicing elit. Natus consequuntur deserunt commodi, nobis qui inventore corrupti iusto aliquid debitis unde non. Adipisci, pariatur. Molestiae, libero esse hic adipisci autem neque?'
  ),
  (
    'Second post!',
    'How-to',
    'Lorem ipsum dolor sit amet consectetur adipisicing elit. Cum, exercitationem cupiditate dignissimos est perspiciatis, nobis commodi alias saepe atque facilis labore sequi deleniti. Sint, adipisci facere! Velit temporibus debitis rerum.'
  ),
  (
    'Third post!',
    'News',
    'Lorem ipsum dolor sit amet, consectetur adipisicing elit. Possimus, voluptate? Necessitatibus, reiciendis? Cupiditate totam laborum esse animi ratione ipsa dignissimos laboriosam eos similique cumque. Est nostrum esse porro id quaerat.'
  ),
  (
    'Fourth post',
    'How-to',
    'Lorem ipsum dolor sit amet consectetur adipisicing elit. Libero, consequuntur. Cum quo ea vero, fugiat dolor labore harum aut reprehenderit totam dolores hic quaerat, est, quia similique! Aspernatur, quis nihil?'
  ),
  (
    'Fifth post',
    'News',
    'Lorem, ipsum dolor sit amet consectetur adipisicing elit. Amet soluta fugiat itaque recusandae rerum sed nobis. Excepturi voluptas nisi, labore officia, nobis repellat rem ab tempora, laboriosam odio reiciendis placeat?'
  ),
  (
    'Sixth post',
    'Listicle',
    'Lorem ipsum dolor sit amet, consectetur adipisicing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.'
  ),
  (
    'Seventh post',
    'Listicle',
    'Lorem ipsum dolor sit, amet consectetur adipisicing elit. Sed, voluptatum nam culpa minus dolore ex nisi recusandae autem ipsa assumenda doloribus itaque? Quos enim itaque error fuga quaerat nesciunt ut?'
  ),
  (
    'Eigth post',
    'News',
    'Lorem, ipsum dolor sit amet consectetur adipisicing elit. Consequatur sequi sint beatae obcaecati voluptas veniam amet adipisci perferendis quo illum, dignissimos aspernatur ratione iusto, culpa quam neque impedit atque doloribus!'
  ),
  (
    'Ninth post',
    'Story',
    'Lorem ipsum dolor sit, amet consectetur adipisicing elit. Dignissimos architecto repellat, in amet soluta exercitationem perferendis eius perspiciatis praesentium voluptate nisi deleniti eaque? Rerum ea quisquam dolore, non error earum?'
  ),
  (
    'Tenth post',
    'How-to',
    'Lorem ipsum dolor sit amet consectetur adipisicing elit. Earum molestiae accusamus veniam consectetur tempora, corporis obcaecati ad nisi asperiores tenetur, autem magnam. Iste, architecto obcaecati tenetur quidem voluptatum ipsa quam?'
  );
```
