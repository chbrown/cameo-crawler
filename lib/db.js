/*jslint node: true */
var sqlcmd = require('sqlcmd');
var logger = require('loge');

var database = process.env.npm_config_database || require('../package').config.database;

var connection = module.exports = new sqlcmd.Connection({
  host: '/tmp',
  database: database,
});
connection.logger = logger;
