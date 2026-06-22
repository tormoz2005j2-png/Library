PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS library_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  currency TEXT NOT NULL DEFAULT '€' CHECK (currency IN ('€', '$', '₽', '£', '¥')),
  initialized INTEGER NOT NULL DEFAULT 0 CHECK (initialized IN (0, 1)),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO library_settings (id, currency, initialized) VALUES (1, '€', 0);

CREATE TABLE IF NOT EXISTS library_items (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 500),
  author TEXT NOT NULL DEFAULT '',
  item_type TEXT NOT NULL CHECK (item_type IN ('Книга', 'Комикс', 'Манга')),
  reading_status TEXT NOT NULL CHECK (reading_status IN ('Хочу прочитать', 'Читаю сейчас', 'Прочитал', 'Перечитал', 'Не дочитал')),
  cover_url TEXT NOT NULL DEFAULT '',
  hd_cover_url TEXT NOT NULL DEFAULT '',
  isbn TEXT NOT NULL DEFAULT '',
  publisher TEXT NOT NULL DEFAULT '',
  publication_date TEXT NOT NULL DEFAULT '',
  language TEXT NOT NULL DEFAULT '',
  series TEXT NOT NULL DEFAULT '',
  genres TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(genres)),
  annotation TEXT NOT NULL DEFAULT '',
  read_date TEXT NOT NULL DEFAULT '',
  rating REAL NOT NULL DEFAULT 0 CHECK (rating IN (0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5)),
  review TEXT NOT NULL DEFAULT '',
  quotes TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(quotes)),
  acquired_on TEXT NOT NULL DEFAULT '',
  purchase_cost_cents INTEGER CHECK (purchase_cost_cents IS NULL OR purchase_cost_cents >= 0),
  is_sold INTEGER NOT NULL DEFAULT 0 CHECK (is_sold IN (0, 1)),
  sold_on TEXT NOT NULL DEFAULT '',
  sale_price_cents INTEGER CHECK (sale_price_cents IS NULL OR sale_price_cents >= 0),
  added INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_library_items_added ON library_items (added DESC);
CREATE INDEX IF NOT EXISTS idx_library_items_title ON library_items (title COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_library_items_author ON library_items (author COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_library_items_status ON library_items (reading_status);
CREATE INDEX IF NOT EXISTS idx_library_items_sold ON library_items (is_sold);

CREATE TRIGGER IF NOT EXISTS library_items_set_updated_at
AFTER UPDATE ON library_items
FOR EACH ROW
BEGIN
  UPDATE library_items SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
END;
