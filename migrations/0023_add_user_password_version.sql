-- Add password_version to users table
ALTER TABLE users ADD COLUMN password_version INTEGER DEFAULT 1;
