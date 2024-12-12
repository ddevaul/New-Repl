ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS games_limit INTEGER DEFAULT 3;
-- Set desi.devaul@gmail.com as admin
UPDATE users SET is_admin = TRUE WHERE email = 'desi.devaul@gmail.com';
