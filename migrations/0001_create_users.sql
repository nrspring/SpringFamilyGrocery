-- `id` is the permanent unique identifier (a UUID) that other tables will
-- reference in the future. It never changes and is never reused.
CREATE TABLE users (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  color      TEXT NOT NULL CHECK (length(color) = 7),
  photo_key  TEXT,
  active     INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Users are disabled, never deleted, so history that points at them stays valid.
CREATE TRIGGER users_no_delete
BEFORE DELETE ON users
BEGIN
  SELECT RAISE(ABORT, 'Users cannot be deleted; disable them instead');
END;
