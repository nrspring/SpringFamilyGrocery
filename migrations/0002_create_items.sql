-- Things the family buys. Like users, items are disabled rather than deleted so
-- anything that references them later (lists, history) never dangles.
CREATE TABLE items (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  photo_key   TEXT,
  added_by    TEXT REFERENCES users (id),
  active      INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TRIGGER items_no_delete
BEFORE DELETE ON items
BEGIN
  SELECT RAISE(ABORT, 'Items cannot be deleted; disable them instead');
END;

-- `alternative_id` is an acceptable substitute when `item_id` isn't available.
-- Directional on purpose: store-brand milk can stand in for name-brand milk
-- without the reverse being true.
CREATE TABLE item_alternatives (
  item_id        TEXT NOT NULL REFERENCES items (id),
  alternative_id TEXT NOT NULL REFERENCES items (id),
  PRIMARY KEY (item_id, alternative_id),
  CHECK (item_id <> alternative_id)
);

CREATE INDEX item_alternatives_alternative ON item_alternatives (alternative_id);
