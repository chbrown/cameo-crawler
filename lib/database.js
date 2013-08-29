'use strict'; /*jslint es5: true, node: true, indent: 2 */
var fs = require('fs');
var path = require('path');
var pg = require('pg');
var logger = require('./logger');
var _ = require('underscore');

var Database = module.exports = function(config) {
  this.config = config;
  if (this.config.database != 'postgres') {
    var postgres_config = _.extend({}, config, {database: 'postgres'});
    this.postgres = new Database(postgres_config);
  }
};

Database.prototype.exists = function(callback) {
  // callback signature: function(err, exists: Boolean)
  // only call this function from a database that is not 'postgres'
  this.postgres.query('SELECT COUNT(*) FROM pg_catalog.pg_database WHERE datname = $1', [this.config.database], function(err, rows) {
    callback(err, rows[0].count > 0);
  });
};

Database.prototype.create = function(callback) {
  // callback signature: function(err)
  // only call this function from a database that is not 'postgres'
  // we can't specify the database name as an argument, so we just put it into the string raw.
  // this is unsafe, of course, but if you want to break your own damn computer, go for it.
  logger.warn('creating database: %s', this.config.database);
  this.postgres.query('CREATE DATABASE ' + this.config.database, [], callback);
};

Database.prototype.executeSchema = function(callback) {
  // callback signature: function(err)
  var self = this;
  var schema_path = path.join(__dirname, '..', 'schema.sql');
  fs.readFile(schema_path, {encoding: 'utf8'}, function (err, schema_sql) {
    if (err) return callback(err);
    logger.debug('executing schema: %s', schema_sql);
    self.query(schema_sql, [], callback);
  });
};

Database.prototype.createIfNotExists = function(callback) {
  // callback signature: function(err)
  var self = this;
  this.exists(function(err, exists) {
    if (err) return callback(err);

    logger.debug('database "%s" %s', self.config.database, exists ? 'exists' : 'does not exist');

    if (exists) {
      self.executeSchema(callback);
    }
    else {
      self.create(function() {
        self.executeSchema(callback);
      });
    }
  });
};

Database.prototype.query = function(sql, args, callback) {
  // callback signature: function(err, rows)
  pg.connect(this.config, function(err, client, done) {
    if (err) {
      logger.error('pg connect error', err);
      callback(err);
    }
    else {
      client.query(sql, args, function(err, result) {
        if (err) {
          logger.debug('pg query error', err, sql, args, err.stack);
        }
        // call `done()` to release the client back to the pool
        // this is really the most important thing that's not clear from
        // the basic pg quickstart sample.
        done();
        if (callback) {
          callback(err, result ? result.rows : null);
        }
      });
    }
  });
};
