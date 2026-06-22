ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin'));

-- Первый владелец библиотеки. Повторное применение миграций не создаёт новых администраторов.
UPDATE users SET role = 'admin' WHERE email = 'tormoz2005j2@gmail.com' COLLATE NOCASE;

CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
