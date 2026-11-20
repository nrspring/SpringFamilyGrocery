-- Places the family shops. Latitude and longitude are optional (a store can be
-- added first and pinned down when someone is standing in it) but come as a pair.
CREATE TABLE stores (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  latitude   REAL,
  longitude  REAL,
  photo_key  TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK ((latitude IS NULL) = (longitude IS NULL)),
  CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
  CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180)
);

-- Where an item can be found. An item can be sold at several stores, each with
-- its own location ("Aisle 12", "Back wall by the dairy").
CREATE TABLE item_stores (
  item_id  TEXT NOT NULL REFERENCES items (id),
  store_id TEXT NOT NULL REFERENCES stores (id),
  location TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (item_id, store_id)
);

CREATE INDEX item_stores_store ON item_stores (store_id);
