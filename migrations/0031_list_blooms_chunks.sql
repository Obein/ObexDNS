-- Migration to recreate list_blooms with chunking support
DROP TABLE IF EXISTS list_blooms;

CREATE TABLE list_blooms (
    list_id INTEGER NOT NULL,
    chunk_index INTEGER NOT NULL,
    bloom_filter_chunk BLOB NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (list_id, chunk_index),
    FOREIGN KEY (list_id) REFERENCES lists(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_list_blooms_list ON list_blooms(list_id);
