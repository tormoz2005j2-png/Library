PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS collections (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL COLLATE NOCASE CHECK (length(trim(name)) BETWEEN 1 AND 80),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, name)
);

CREATE TABLE IF NOT EXISTS collection_titles (
  collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  title_id TEXT NOT NULL REFERENCES library_items(id) ON DELETE CASCADE,
  added_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (collection_id, title_id)
);

CREATE INDEX IF NOT EXISTS idx_collections_user ON collections(user_id, name);
CREATE INDEX IF NOT EXISTS idx_collection_titles_title ON collection_titles(title_id);

CREATE TRIGGER IF NOT EXISTS collections_updated_at AFTER UPDATE ON collections BEGIN
  UPDATE collections SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
END;
