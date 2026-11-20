-- The named places inside a store ("Aisle 12", "Back wall by the dairy"), in the order
-- you walk the store. The List sorts by `position`. An item's location is still the
-- text in item_stores.location; the application keeps that text equal to one of these
-- names (matched ignoring upper/lower case).
CREATE TABLE store_locations (
  id       TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores (id),
  name     TEXT NOT NULL,
  position INTEGER NOT NULL
);

CREATE UNIQUE INDEX store_locations_name ON store_locations (store_id, name COLLATE NOCASE);

-- Carry over every location already in use, one per store and name (ignoring case),
-- ordered by name to begin with. People can reorder them from the app.
INSERT INTO store_locations (id, store_id, name, position)
SELECT lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' ||
       substr(lower(hex(randomblob(2))), 2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) ||
       substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6))),
       store_id,
       name,
       position
  FROM (
    SELECT store_id,
           name,
           ROW_NUMBER() OVER (PARTITION BY store_id ORDER BY name COLLATE NOCASE) - 1 AS position
      FROM (
        SELECT store_id, MIN(location) AS name
          FROM item_stores
         WHERE location <> ''
         GROUP BY store_id, location COLLATE NOCASE
      )
  );

-- Where two items spelled one location with different capitals, use the stored spelling.
UPDATE item_stores
   SET location = (
     SELECT l.name FROM store_locations l
      WHERE l.store_id = item_stores.store_id AND l.name = item_stores.location COLLATE NOCASE
   )
 WHERE location <> '';
