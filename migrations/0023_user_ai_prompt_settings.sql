PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS user_ai_prompt_settings (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  ai_description_prompt TEXT NOT NULL DEFAULT '',
  translation_prompt TEXT NOT NULL DEFAULT '',
  image_prompt TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
