-- Create system_secrets table
CREATE TABLE IF NOT EXISTS system_secrets (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL
);

-- Migrate existing jwt_secret from system_settings if it exists
INSERT OR IGNORE INTO system_secrets (key, value, updated_at)
SELECT key, value, updated_at FROM system_settings WHERE key = 'jwt_secret';

-- Clean up jwt_secret from system_settings
DELETE FROM system_settings WHERE key = 'jwt_secret';
