PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY NOT NULL,
  email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  display_name TEXT NOT NULL CHECK (length(trim(display_name)) BETWEEN 2 AND 80),
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_title_statuses (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title_id TEXT NOT NULL REFERENCES library_items(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('read', 'purchased', 'sold', 'want_to_read', 'reading', 'on_hold')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, title_id)
);

CREATE TABLE IF NOT EXISTS title_transactions (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title_id TEXT NOT NULL REFERENCES library_items(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('purchase', 'sale')),
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  currency TEXT NOT NULL CHECK (currency IN ('EUR', 'USD', 'RUB', 'GBP', 'JPY')),
  action_date TEXT NOT NULL,
  comment TEXT NOT NULL DEFAULT '' CHECK (length(comment) <= 2000),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title_id TEXT NOT NULL REFERENCES library_items(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (length(trim(body)) BETWEEN 1 AND 10000),
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 10),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, title_id)
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_statuses_title ON user_title_statuses(title_id);
CREATE INDEX IF NOT EXISTS idx_transactions_user_title ON title_transactions(user_id, title_id, action_date DESC);
CREATE INDEX IF NOT EXISTS idx_reviews_title ON reviews(title_id, updated_at DESC);

CREATE TRIGGER IF NOT EXISTS users_updated_at AFTER UPDATE ON users BEGIN
  UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
END;
CREATE TRIGGER IF NOT EXISTS statuses_updated_at AFTER UPDATE ON user_title_statuses BEGIN
  UPDATE user_title_statuses SET updated_at = CURRENT_TIMESTAMP WHERE user_id = OLD.user_id AND title_id = OLD.title_id;
END;
CREATE TRIGGER IF NOT EXISTS transactions_updated_at AFTER UPDATE ON title_transactions BEGIN
  UPDATE title_transactions SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
END;
CREATE TRIGGER IF NOT EXISTS reviews_updated_at AFTER UPDATE ON reviews BEGIN
  UPDATE reviews SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
END;
