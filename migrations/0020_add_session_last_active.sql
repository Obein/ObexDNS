-- Add last_active_at to sessions table for idle timeout tracking
ALTER TABLE sessions ADD COLUMN last_active_at INTEGER;

-- Initialize last_active_at for existing sessions
UPDATE sessions SET last_active_at = COALESCE(created_at, expires_at - 86400) WHERE last_active_at IS NULL;
