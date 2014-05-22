#!/usr/bin/env node
/*jslint node: true */
var async = require('async');
var logger = require('loge');
var optimist = require('optimist');

var server = require('../server');

optimist
  .usage('Usage: cameo-crawler <options> <url> [<url> ...] ')
  .describe({
    tag: 'tag to apply to the given seed urls (which propagates to all linked pages)',

    help: 'print this help message',
    verbose: 'print extra output',
    version: 'print version',
  })
  .boolean(['help', 'verbose', 'version'])
  .demand(['tag'])
  .alias({verbose: 'v'});

var argv = optimist.argv;
logger.level = argv.verbose ? 'debug' : 'info';

if (argv.help) {
  optimist.showHelp();
}
else if (argv.version) {
  console.log(require('../package').version);
}
else {
  // argv = optimist.check(function(argv) {
  //   if (argv._.length < 1) {
  //     throw new Error('You must specify at least one seed url');
  //   }
  // }).argv;

  server.initialize(function(err) {
    server.addSeeds(argv._, argv.tag, 0, function(err) {
      if (err) throw err;
      server.work(function(err) {
        if (err) throw err;
        logger.info('Completed run loop, exiting.');
        process.exit(0);
      });
    });
  });
}
