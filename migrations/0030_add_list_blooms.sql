-- Migration to add list-level Bloom Filters
CREATE TABLE IF NOT EXISTS list_blooms (
    list_id INTEGER PRIMARY KEY,
    bloom_filter BLOB NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (list_id) REFERENCES lists(id) ON DELETE CASCADE
);
