# cameo-crawler

There are already tens of Node.js scripts that spider / crawl sites, and many more Python and Ruby ones.
It isn't clear how many of them they work, or that they even recurse.
Or if they do, is it depth-first? Breadth-first?

This project is a work in progress. I intend to document at least its philosophy, if not methodology,
better than the competition.

It's ruthless (this package used to be called "ruthless") in that it does not respect `robots.txt`.
So, you're on your own if you violate some vengeful site's TOS.


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


### Initialization

If the supplied credentials have superuser privileges, the database and `pages` table will be created automatically.

Otherwise, run the following at your command line to initialize (and reset) everything to the defaults:

```bash
dropdb cameo-crawler; createdb cameo-crawler && psql cameo-crawler < schema.sql
```

### TODO

* Use [`cluster`](http://nodejs.org/api/cluster.html) to spawn multiple workers.
  It's currently kind of slow, because most things happen in series.
* The `seen` cache can handle most locking issues; as soon as `work()` fetches a new url, add the url to seen.
  Even if a page is fetched twice, it's not a big deal!
* Allow a threshold depth, i.e., stop after going 10 links deep into a seed url.
* Allow constraining a query to a single domain.


## License

Copyright © 2012–2014 Christopher Brown. [MIT Licensed](LICENSE).
