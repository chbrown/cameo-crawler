Previous dependencies:

    {
      "dependencies": {
        "cheerio": "*",
        "underscore": "*",
        "buffertools": "*",
        "jschardet": "*",
        "iconv": "*"
      }
    }

And their requires:

    var jschardet = require('jschardet');
    jschardet.detect();

    var Iconv = require('iconv').Iconv;

    var cheerio = require('cheerio');

Little example:

    var test_url = 'http://yahoo.com/';

    var res = null;
    http.get(test_url, function(response) { res = response; })

    var html = null;
    GET(test_url, function(err, res) { html = res; });
    html.match(/href=('|")(.+?)\1/g)

    { 'content-type': 'text/html; charset=UTF-8' }

Actually parse the DOM with cheerio:

    var $ = cheerio.load(html), hrefs = {};
    $('a').each(function() {
      var href = this.attr('href');
      if (href)
        hrefs[href.replace(/#.+/g, '')] = 1;
      else
        console.dir(this);
    });

Fix bad urls that are already in the database:

    query("SELECT id, url FROM pages WHERE url LIKE '%&amp;%' ORDER BY depth", function(err, result) {
      logerr(err);
      async.forEachSeries(result.rows, function(row, callback) {
        var new_url = row.url.replace(/&amp;/g, '&');
        console.log(row.url, '->', new_url);
        query('UPDATE pages SET url = $1, fetched = NULL WHERE id = $2', [new_url, row.id], function(err) {
          if (err && err.message.match(/violates unique constraint/)) {
            err = null;
          }
          callback(err);
        });
      }, function(err) {
        logerr(err);
        console.log('Done fixing');
      });
    });
