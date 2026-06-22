-- Перенос прежних статусов чтения из каталога в личную историю владельца.
-- Каталог хранил единый статус на тайтл (наследие однопользовательской версии),
-- поэтому статистика «в моей истории» и список «Мои тайтлы» оставались пустыми.
-- Маппинг повторяет LEGACY_STATUS_CLASS из веб-приложения.
INSERT INTO user_title_statuses (user_id, title_id, status)
SELECT u.id, i.id,
  CASE i.reading_status
    WHEN 'Прочитал' THEN 'read'
    WHEN 'Перечитал' THEN 'read'
    WHEN 'Читаю сейчас' THEN 'reading'
    WHEN 'Хочу прочитать' THEN 'want_to_read'
    WHEN 'Не дочитал' THEN 'on_hold'
  END
FROM library_items i
JOIN users u ON u.email = 'tormoz2005j2@gmail.com' COLLATE NOCASE
WHERE i.reading_status IN ('Прочитал', 'Перечитал', 'Читаю сейчас', 'Хочу прочитать', 'Не дочитал')
ON CONFLICT(user_id, title_id) DO UPDATE SET status = excluded.status;
