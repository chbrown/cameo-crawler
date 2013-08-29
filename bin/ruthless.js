#!/usr/bin/env node
'use strict'; /*jslint es5: true, node: true, indent: 2, multistr: true */ /* globals setImmediate */
var async = require('async');
var _ = require('underscore');

var ruthless = require('..');

var optimist = require('optimist')
  .usage('Usage: ruthless <options> <url> [<url> ...] ')
  .describe({
    tag: 'tag to apply to the given seed urls',

    database: 'postgres database name (will be created if needed)',
    // pg uses "user" instead of "username", so we'll go with that.
    user: 'postgres username',
    password: 'postgres password (optional)',

    help: 'print this help message',
    verbose: 'print extra output',
    version: 'print version',
  })
  .boolean(['help', 'verbose', 'version'])
  .demand(['tag'])
  .alias({verbose: 'v'})
  .default({
    database: 'ruthless',
    user: process.env.USER,
  });

var argv = optimist.argv;
ruthless.logger.level = argv.verbose ? 'debug' : 'info';

if (argv.help) {
  optimist.showHelp();
}
else if (argv.version) {
  console.log(require('../package').version);
}
else {
  argv = optimist.check(function(argv) {
    if (argv._.length < 1) {
      throw new Error('You must specify at least one seed url');
    }
  }).argv;

  // select only possible values, based on `require('pg/lib/defaults')`
  var database_config = _.pick(argv, 'host', 'user', 'database', 'password',
    'port', 'rows', 'binary', 'poolSize', 'poolIdleTimeout',
    'reapIntervalMillis', 'poolLog', 'client_encoding');

  var database = new ruthless.Database(database_config);
  database.createIfNotExists(function(err) {
    if (err) throw err;
    // console.log('database.createIfNotExists done');
    ruthless.seedUrls(database, argv._, argv.tag, 0, function(err) {
      if (err) throw err;
      ruthless.run(database, function(err) {
        if (err) throw err;
        ruthless.logger.info('Completed run loop, exiting.');
        process.exit(0);
      });
    });
  });
}
