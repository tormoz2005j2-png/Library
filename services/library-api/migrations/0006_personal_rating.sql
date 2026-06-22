ALTER TABLE user_title_statuses ADD COLUMN rating INTEGER DEFAULT NULL
  CHECK (rating IS NULL OR rating BETWEEN 1 AND 10);

INSERT INTO user_title_statuses(user_id,title_id,status,rating)
SELECT user_id,title_id,'read',rating FROM reviews WHERE true
ON CONFLICT(user_id,title_id) DO UPDATE SET rating=excluded.rating;
