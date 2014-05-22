/*jslint node: true */ /* globals setImmediate */
var async = require('async');
var logger = require('loge');
var path = require('path');

var db = require('./lib/db');
var models = require('./lib/models');

exports.initialize = function(callback) {
  /** initialize: if the database does not already exist, create it and run the

  Seeds that already exist are ignored.

  urls: [String]
  tag: String
  depth: Number (usually 0)
  callback: function(err: Error | undefined)
  */
  db.databaseExists(function(err, exists) {
    if (err) return callback(err);
    if (exists) return callback();

    logger.debug('Creating database');
    db.createDatabase(function(err) {
      if (err) return callback(err);

      var schema_path = path.join(__dirname, 'schema.sql');
      logger.debug('Executing schema on database');
      db.executeSQLFile(schema_path, callback);
    });
  });
};

exports.addSeeds = function(urls, tag, depth, callback) {
  /** addSeeds: insert a list of urls to the database with a given tag and depth.

  Seeds that already exist are ignored.

  urls: [String]
  tag: String
  depth: Number (usually 0)
  callback: function(err: Error | undefined)
  */
  logger.info('Seeding %d urls with tag "%s" and depth %d', urls.length, tag, depth);
  async.forEach(urls, function(url, callback) {
    db.Insert('pages')
    .set({
      url: url,
      tag: tag,
      depth: depth,
    })
    .execute(function(err) {
      if (err) {
        if (err.message.match(/violates unique constraint/)) {
          logger.debug('URL already exists: %s', url);
          // pass over unique constraint violations
          return callback();
        }
        return callback(err);
      }
      logger.info('URL seeded: %s', url);
      callback();
    });
  }, callback);
};

exports.work = function(callback) {
  /** work: run the main worker continuously until no more urls can be found.
  This is the web we're talking about, so actually finishing is unlikely.

  callback: function(err: Error | undefined)
  */
  // seen_urls is just a local cache to avoid all the unique conflicts on (tag, url)
  // it's not preloaded with a `SELECT url FROM pages`, though maybe it should be.
  // It's not required, but it can prevent having to make lots of INSERTs that fail
  // due to the UNIQUE constraint on (tag, url)
  var seen_urls = {};
  logger.info('Beginning loop at %s', new Date().toISOString());
  (function loop() {
    models.Page.next(function(err, page) {
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
