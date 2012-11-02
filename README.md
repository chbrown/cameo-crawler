# Ruthless

There are already tens of Node.js scripts that spider / crawl sites, many more Python and Ruby ones.
It isn't clear how they work, or that they even recurse.

This project is a work in progress. I intend to document at least its philosophy, if not methodology,
better than the competition.

It's called `ruthless` because it does not respect robots.txt.

## Current philosophy

I wanted a stateful queue, in case of stops or restarts. Redis was the first choice, but I had too much metadata.
So I'm using Postgres right now. Not sure if that's the best idea. The `pages` table has these columns:

    id, parent_id, url, tag, depth, content, plaintext, queued, fetched, failed, error

The `pages` table:

- Seed urls are accompanied by a freeform tag, and enter the database with a depth of 0.
- The pages they link to inherit that tag, have a `parent_id` set to the linking page's `id`.
- The child pages have a `depth` of `depth + 1` if they are on the same domain (protocol and subdomain insensitive),
  or `depth + 100` if they do not share the domain (defined by the `hostname` field that Node.js's `Url.parse(urlStr)` produces).
- The crawl proceeds breadth-first, so the depth never needs to be updated.

Here is an sample of depths retrieved for a single seed site (a blog) that I let run for a couple of minutes:

    SELECT depth, COUNT(depth) FROM pages GROUP BY depth ORDER BY depth;

    Depth  Count
        0      1
        1     81
        2    319
        3    731
        4    851
      100     22
      101    151
      102   1071
      103   1593

As it was, I hadn't gotten through the 3-deep sites yet.

Question: should I even keep track of sites >10 deep? Do I care about other domains?

TODO: Add more than one worker! It's currently kind of slow, because most things happen in series.
Basically, I think the `seen` cache can handle most locking issues; as soon as `work()` fetches a new url, add the url to seen.
Even if a page is fetched twice, it's not a big deal!

## Initialization

Like I said, this uses a PostgreSQL database.

    dropdb ruthless; createdb ruthless && psql ruthless < schema.sql

# Notes

    var test_url = 'http://yahoo.com/';

    var res = null;
    http.get(test_url, function(response) { res = response; })

    var html = null;
    GET(test_url, function(err, res) { html = res; });
    html.match(/href=('|")(.+?)\1/g)

    { 'content-type': 'text/html; charset=UTF-8' }

### Things that I used to depend on

    "cheerio": "*",
    "underscore": "*",
    "buffertools": "*",
    "jschardet": "*",
    "iconv": "*",

    __ = require('underscore')._,

## License

Copyright 2012 Christopher Brown, [MIT License](http://opensource.org/licenses/MIT)
