-- An optional quantity note on a list entry ("2", "1 gallon", "the big bag"). It belongs to the
-- entry, not the item: taking an item off the list deletes the entry, so the next time it is
-- added the quantity starts out blank.
ALTER TABLE list_entries ADD COLUMN quantity TEXT NOT NULL DEFAULT '';
