'use strict'; /*jslint es5: true, node: true, indent: 2 */
var async = require('async');
var request = require('./request');
var logger = require('./logger');
var url = require('url');
var _ = require('underscore');

var href_regex = /href\s*=\s*('|")(.+?)\1/g;

var Page = exports.Page = function(database, attrs) {
  // attrs keys: url, tag, depth, parent_id
  this.database = database;
  this.attrs = attrs;
};
Page.prototype.requestContent = function(callback) {
  /** `requestContent`: make an http/https call to fetch html from the internet and add it to this page.

  Requires an extant page (with an id).

  will set `this.error = error: String` if the request fails, or `this.content = html: String` if the request succeeds.

  also persists that value to the database -- the callback reflects the success of the persistence query, not the fetch.

  callback: function(err: Error | undefined)
  */
  var self = this;
  logger.info('Requesting "%s" at depth %d via HTTP GET', this.attrs.url, this.attrs.depth);
  var urlObj = url.parse(this.attrs.url);
  request(urlObj, function(err, html) {
    if (err) {
      logger.error('request error', err);
      self.attrs.error = err.toString();
      self.database.query('UPDATE pages SET failed = NOW(), error = $2 WHERE id = $1', [self.attrs.id, self.attrs.error], callback);
    }
    else {
      self.attrs.content = html;
      self.database.query('UPDATE pages SET fetched = NOW(), content = $2 WHERE id = $1', [self.attrs.id, self.attrs.content], function(err) {
        if (err) {
          logger.error('update page error', err);
        }
        callback(err);
      });
    }
  });
};
Page.prototype.getLinks = function() {
  /** `getLinks`: return array of raw (potentially relative) urls from this page's content.

  returns [String]
  */
  var hrefs = [];
  var href_match = null;
  while ((href_match = href_regex.exec(this.attrs.content))) {
    // var href = .replace(/&amp;/g, '&');
    var decoded_href = decodeURI(href_match[2]);
    var nohash_href = decoded_href.replace(/#.+/g, '');
    // sanitize the url a little bit. not sure why this happens.
    // if (href.match(/^http%3A%2F%2F/)) {
    //   href = decodeURIComponent(href);
    // }
    hrefs.push(nohash_href);
  }
  return hrefs;
};
Page.prototype.queueLinks = function(seen_urls, callback) {
  /** `queueLinks`: read raw urls from `getLinks()` and insert them into the database after processing and filtering.

  seen_urls: Object
      a map from urls to 1 if we've already seen this page's url-tag combo, otherwise undefined.

  callback: function(err: Error | undefined)
  */
  var self = this;
  // urlObj is the full url object of the parent page
  var urlObj = url.parse(this.attrs.url);

  var urls = this.getLinks()
  // ignore mailto: hrefs
  .filter(function(href) {
    return href.match(/^mailto:/) === null;
  })
  // resolve hrefs from the current page's url
  .map(function(href) {
    return url.resolve(self.attrs.url, href);
  });

  // remove duplicates
  var unique_urls = _.uniq(urls);

  // ignore seen urls
  var pages = unique_urls.filter(function(urlStr) {
    return seen_urls[urlStr] === undefined;
  })
  // convert to Page objects
  .map(function(urlStr) {
    var distance = url.parse(urlStr).hostname === urlObj.hostname ? 1 : 100;

    return new Page(self.database, {
      parent_id: self.attrs.id,
      url: urlStr,
      tag: self.attrs.tag,
      depth: self.attrs.depth + distance,
    });
  });

  async.forEach(pages, function(page, callback) {
    logger.debug('queueing url "%s" at depth %d', page.attrs.url, page.attrs.depth);
    self.database.query('INSERT INTO pages (parent_id, url, tag, depth) VALUES ($1, $2, $3, $4)',
      [page.attrs.parent_id, page.attrs.url, page.attrs.tag, page.attrs.depth], function(err) {
      // only listen to errors that _aren't_ unique violations
      if (err && !err.message.match(/violates unique constraint/)) {
        callback(err);
      }
      else {
        seen_urls[page.attrs.url] = 1;
        callback();
      }
    });
  }, function(err) {
    if (err) {
      logger.error('page.queueLinks error', err);
      callback(err);
    }
    else {
      callback();
    }
  });
};

Page.next = function(database, callback) {
  /** `Page.next`: find the next lowest depth in the queue and callback with a randomly selected Page among all pages at that depth.

  We prioritize lower depth urls, but randomize among same-depth urls.

  callback: function(err: Error | undefined, page: Page | undefined)
  */
  database.query('SELECT depth, COUNT(*) FROM pages WHERE fetched IS NULL AND failed IS NULL GROUP BY depth ORDER BY depth ASC', [], function(err, rows) {
    if (err) {
      logger.error('Depth query error', err);
      callback(err);
    }
    else if (rows.length === 0) {
      logger.warn('Queue is empty');
      callback();
    }
    else {
      var depth = rows[0].depth;
      var offset = Math.random() * rows[0].count | 0;
      database.query('SELECT * FROM pages WHERE fetched IS NULL AND failed IS NULL AND depth = $1 OFFSET $2 LIMIT 1', [depth, offset], function(err, rows) {
        if (err) {
          logger.error('select-by-depth query failed', err);
          callback(err);
        }
        else {
          var row = rows[0];
          logger.debug('Page.next result', row);
          var page = new Page(database, {id: row.id, url: row.url, tag: row.tag, depth: depth});
          callback(err, page);
        }
      });
    }
  });
};
