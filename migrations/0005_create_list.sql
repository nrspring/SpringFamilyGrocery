-- The shared shopping list: the items someone has starred to buy. One row per
-- item, remembering who put it on the list and when. Rows disappear when the
-- item is removed from the list or deleted.
CREATE TABLE list_entries (
  item_id    TEXT PRIMARY KEY REFERENCES items (id),
  added_by   TEXT REFERENCES users (id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
