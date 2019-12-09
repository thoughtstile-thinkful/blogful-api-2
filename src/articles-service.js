'use strict';

const ArticlesService = {
  getAllArticles(knex) {
    return knex.select('*').from('blogful_articles');
  }
};

module.exports = ArticlesService;
