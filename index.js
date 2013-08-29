'use strict'; /*jslint es5: true, node: true, indent: 2 */ /* globals setImmediate */
var async = require('async');
var fs = require('fs');
var pg = require('pg');
var url = require('url');
var models = require('./lib/models');
var logger = exports.logger = require('./lib/logger');

exports.Database = require('./lib/database');

var seedUrls = exports.seedUrls = function(database, urls, tag, depth, callback) {
  /** seed: insert a list of urls to the database with a given tag and depth
  raising their depth to 0 if they already exist.

  urls: [String]
  callback: function(err: Error | undefined)
  */
  logger.info('Seeding %d urls with tag "%s" and depth %d', urls.length, tag, depth);
  async.forEach(urls, function(url, callback) {
    database.query('INSERT INTO pages (url, tag, depth) VALUES ($1, $2, $3)', [url, tag, depth], function(err) {
      if (err && err.message.match(/violates unique constraint/)) {
        // enforce specified depth if the url-tag combo already exists
        logger.debug('Setting existing seed url %s to depth of %d', url, depth);
        database.query('UPDATE pages SET depth = $3 WHERE url = $1 AND tag = $2', [url, tag, depth], callback);
      }
      else {
        logger.debug('Added seed url "%s" at depth of 0', url);
        callback(err);
      }
    });
  }, callback);
};

var run = exports.run = function(database, callback) {
  /** `run`: run the main worker continuously until no more urls can be found (unlikely).

  callback: function(err: Error | undefined)
  */
  // seen_urls is just a local cache to avoid all the unique conflicts on (tag, url)
  // it's not preloaded with a `SELECT url FROM pages`, though maybe it should be.
  // It's not required, but it can prevent having to make lots of INSERTs that fail
  // due to the UNIQUE constraint on (tag, url)
  var seen_urls = {};
  logger.info('Beginning loop at %s', new Date().toISOString());
  (function loop() {
    models.Page.next(database, function(err, page) {
      if (err) return callback(err);
      // if we've hit the end of the queue, we exit.
      if (!page) return callback();
      // otherwise, process the page
      page.requestContent(function(err) {
        if (err) return callback(err);
        page.queueLinks(seen_urls, function(err) {
          if (err) return callback(err);
          setImmediate(loop);
        });
      });
    });
  })();
};
