'use strict'; /*jslint es5: true, node: true, indent: 2 */
var winston = require('winston');

// winston Transport sets its defaults with `||` instead of checking for `=== undefined`
var transport = new winston.transports.Console();
// so we have to set `level` here, instead of in the constructor. awesome design choice, flatiron.
transport.level = false;

var logger = module.exports = new winston.Logger({transports: [transport]});
