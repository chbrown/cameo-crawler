/*jslint node: true */
var async = require('async');
var logger = require('loge');
var url = require('url');

var db = require('./db');
var request = require('./request');

function uniq(xs) {
  var obj = {};
  xs.forEach(function(x) {
    obj[x] = 1;
  });
  return Object.keys(obj);
}

var href_regex = /href\s*=\s*('|")(.+?)\1/g;

var Page = exports.Page = function(attrs) {
  // attrs keys: url, tag, depth, parent_id
  this.attrs = attrs;
};
Page.prototype.requestContent = function(callback) {
  /** `requestContent`: make an http/https call to fetch html from the
  internet and add it to this page.

  Requires an extant page (with an id).

  will set `this.error = error: String` if the request fails,
  or `this.content = html: String` if the request succeeds.

  also persists that value to the database -- the callback reflects
  the success of the persistence query, not the fetch.

  callback: function(err: Error | undefined)
  */
  var self = this;
  logger.info('Requesting "%s" at depth %d via HTTP GET', this.attrs.url, this.attrs.depth);
  var urlObj = url.parse(this.attrs.url);
  request(urlObj, function(err, html) {
    if (err) {
      logger.error('request error', err);
      self.attrs.error = err.toString();
      db.Update('pages')
      .set({failed: new Date(), error: self.attrs.error})
      .whereEqual({id: self.attrs.id})
      .execute(callback);
    }
    else {
      self.attrs.content = html;
      db.Update('pages')
      .set({fetched: new Date(), content: self.attrs.content})
      .whereEqual({id: self.attrs.id})
      .execute(function(err) {
        if (err) logger.error('update page error', err);
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
  /** `queueLinks`: read raw urls from `getLinks()` and insert them into the
  database after processing and filtering.

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
  var unique_urls = uniq(urls);

  // ignore seen urls
  var pages = unique_urls.filter(function(urlStr) {
    return seen_urls[urlStr] === undefined;
  })
  // convert to Page objects
  .map(function(urlStr) {
    var distance = url.parse(urlStr).hostname === urlObj.hostname ? 1 : 100;

    return new Page({
      parent_id: self.attrs.id,
      url: urlStr,
      tag: self.attrs.tag,
      depth: self.attrs.depth + distance,
    });
  });

  async.forEach(pages, function(page, callback) {
    logger.debug('queueing url "%s" at depth %d', page.attrs.url, page.attrs.depth);
    db.Insert('pages')
    .set({
      parent_id: page.attrs.parent_id,
      url: page.attrs.url,
      tag: page.attrs.tag,
      depth: page.attrs.depth,
    })
    .execute(function(err) {
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
      return callback(err);
    }

    callback();
  });
};

Page.next = function(callback) {
  /** `Page.next`: find the next lowest depth in the queue and callback with a randomly selected Page among all pages at that depth.

  We prioritize lower depth urls, but randomize among same-depth urls.

  callback: function(err: Error | undefined, page: Page | undefined)
  */
  db.query('SELECT depth, COUNT(*) FROM pages WHERE fetched IS NULL AND failed IS NULL GROUP BY depth ORDER BY depth ASC', [], function(err, rows) {
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
      db.Select('pages')
      .where('fetched IS NULL AND failed IS NULL')
      .whereEqual({depth: depth})
      .offset(offset)
      .limit(1)
      .execute(function(err, rows) {
        if (err) {
          logger.error('select-by-depth query failed', err);
          return callback(err);
        }

        var row = rows[0];
        logger.debug('Page.next result', row);
        var page = new Page({id: row.id, url: row.url, tag: row.tag, depth: depth});
        callback(err, page);
      });
    }
  });
};
