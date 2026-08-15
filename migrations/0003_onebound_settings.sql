CREATE TABLE integration_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  onebound_key_ciphertext TEXT,
  onebound_secret_ciphertext TEXT,
  updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
