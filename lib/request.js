/*jslint node: true */
var http = require('http');
var https = require('https');
var url = require('url');
var streaming = require('streaming');
var zlib = require('zlib');

// kind of like mikeal's request package, but simpler and more transparent

var request = module.exports = function(options, callback) {
  // options should be a url-parsed object, though it can also have request fields like "headers", "agent", etc.
  // callback signature: function(err, html)
  // http://nodejs.org/api/http.html#http_http_request_options_callback

  // default to GET
  if (options.method === undefined) {
    options.method = 'GET';
  }
  // and make space for the default headers if needed
  if (options.headers === undefined) {
    options.headers = {};
  }

  // accept gzip and deflate compression
  if (options.headers['accept-encoding'] === undefined) {
    options.headers['accept-encoding'] = 'gzip,deflate';
  }

  // this supports https, but doesn't do any ssl checking, afaik
  var req = (options.protocol == 'https:' ? https : http).request(options)
  .on('error', callback)
  .on('response', function(response) {
    if (response.statusCode >= 300 && response.statusCode <= 303) {
      // follow redirect
      var redirect_urlStr = url.resolve(options, response.headers.location);
      var redirect_options = url.parse(redirect_urlStr);
      // a parsed url will have the following fields, though some may be null
      // href protocol auth hostname port host pathname search path query hash slashes
      redirect_options.method = options.method;
      redirect_options.headers = options.headers;
      request(redirect_options, callback);
    }
    else if (!response.headers['content-type'].match(/text\/html/)) {
      var err = new Error('Not html');
      callback(err);
    }
    else {
      var response_stream = response;

      var encoding = response.headers['content-encoding'];
      if (encoding == 'gzip') {
        response_stream = response.pipe(zlib.createGunzip());
      }
      else if (encoding == 'deflate') {
        response_stream = response.pipe(zlib.createInflate());
      }

      streaming.readToEnd(response_stream, function(err, chunks) {
        if (err) return callback(err);

        callback(err, chunks.join(''));
      });
    }
  });

  req.end();
  return req;
};
