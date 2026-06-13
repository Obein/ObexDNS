-- Add rotation_counter for Refresh Token Rotation (RTR) tracking
ALTER TABLE sessions ADD COLUMN rotation_counter INTEGER DEFAULT 0;
