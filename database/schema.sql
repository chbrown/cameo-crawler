CREATE TABLE pages (
  id serial PRIMARY KEY,
  parent_id integer references pages(id),
  url text NOT NULL,
  tag text,
  depth integer NOT NULL,
  content text,
  plaintext text,
  queued timestamp DEFAULT current_timestamp NOT NULL,
  fetched timestamp,
  failed timestamp,
  error text,
  UNIQUE (tag, url)
);
