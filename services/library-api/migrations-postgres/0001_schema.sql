CREATE TABLE IF NOT EXISTS library_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1), currency TEXT NOT NULL DEFAULT '€',
  initialized INTEGER NOT NULL DEFAULT 0 CHECK (initialized IN (0,1)), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO library_settings(id,currency,initialized) VALUES(1,'€',0) ON CONFLICT(id) DO NOTHING;

CREATE TABLE IF NOT EXISTS library_items (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, author TEXT NOT NULL DEFAULT '', item_type TEXT NOT NULL,
  reading_status TEXT NOT NULL, cover_url TEXT NOT NULL DEFAULT '', hd_cover_url TEXT NOT NULL DEFAULT '',
  isbn TEXT NOT NULL DEFAULT '', publisher TEXT NOT NULL DEFAULT '', publication_date TEXT NOT NULL DEFAULT '',
  language TEXT NOT NULL DEFAULT '', series TEXT NOT NULL DEFAULT '', genres TEXT NOT NULL DEFAULT '[]',
  annotation TEXT NOT NULL DEFAULT '', read_date TEXT NOT NULL DEFAULT '', rating DOUBLE PRECISION NOT NULL DEFAULT 0,
  review TEXT NOT NULL DEFAULT '', quotes TEXT NOT NULL DEFAULT '[]', acquired_on TEXT NOT NULL DEFAULT '',
  purchase_cost_cents INTEGER, is_sold INTEGER NOT NULL DEFAULT 0, sold_on TEXT NOT NULL DEFAULT '',
  sale_price_cents INTEGER, added BIGINT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_library_items_added ON library_items(added DESC);
CREATE INDEX IF NOT EXISTS idx_library_items_title ON library_items(lower(title));

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL, password_salt TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'user' CHECK(role IN('user','admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE, expires_at TIMESTAMPTZ NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS user_title_statuses (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title_id TEXT NOT NULL REFERENCES library_items(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK(status IN('read','purchased','sold','want_to_read','reading','on_hold')),
  read_on TEXT, rating INTEGER CHECK(rating BETWEEN 1 AND 10),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY(user_id,title_id)
);
CREATE TABLE IF NOT EXISTS title_transactions (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title_id TEXT NOT NULL REFERENCES library_items(id) ON DELETE CASCADE, type TEXT NOT NULL CHECK(type IN('purchase','sale')),
  amount_cents INTEGER NOT NULL CHECK(amount_cents>=0), currency TEXT NOT NULL CHECK(currency IN('EUR','USD','RUB','GBP','JPY')),
  action_date TEXT NOT NULL, comment TEXT NOT NULL DEFAULT '', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title_id TEXT NOT NULL REFERENCES library_items(id) ON DELETE CASCADE, body TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 10), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(user_id,title_id)
);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_statuses_title ON user_title_statuses(title_id);
CREATE INDEX IF NOT EXISTS idx_transactions_user_title ON title_transactions(user_id,title_id,action_date DESC);
CREATE INDEX IF NOT EXISTS idx_reviews_title ON reviews(title_id,updated_at DESC);

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at=NOW(); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS users_updated_at ON users; CREATE TRIGGER users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS statuses_updated_at ON user_title_statuses; CREATE TRIGGER statuses_updated_at BEFORE UPDATE ON user_title_statuses FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS transactions_updated_at ON title_transactions; CREATE TRIGGER transactions_updated_at BEFORE UPDATE ON title_transactions FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS reviews_updated_at ON reviews; CREATE TRIGGER reviews_updated_at BEFORE UPDATE ON reviews FOR EACH ROW EXECUTE FUNCTION set_updated_at();
