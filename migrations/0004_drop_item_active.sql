-- Items are deleted rather than disabled now, so the active flag is unused.
ALTER TABLE items DROP COLUMN active;
