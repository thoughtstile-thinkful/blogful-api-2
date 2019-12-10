Start Postgres with:

```
postgres
```

Reset Postgres (postmaster.pid errors) with:

```
pg_ctl -D /usr/local/var/postgres stop -s -m fast
```

After Postgres is started, Create Database with:

```
createdb -U dunder_mifflin blogful-test
```

Move example.env to .env with:

```
mv example.env .env
```

---

Used for migrations:

```
npm i postgrator-cli@3.2.0 -D
```

Knex Driver:

```
npm i pg
```

Migration Commands:

```
npm run migrate -- 0
npm run migrate
```

Seeding database command:

```
psql -U dunder_mifflin -d blogful -f ./seeds/seed.blogful_articles.sql
```

Install knex:

```
npm i knex
```

Migrate test database:

```
npm run migrate:test
```
