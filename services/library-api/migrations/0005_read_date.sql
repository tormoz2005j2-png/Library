ALTER TABLE user_title_statuses ADD COLUMN read_on TEXT DEFAULT NULL
  CHECK (read_on IS NULL OR (read_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND date(read_on) = read_on));
