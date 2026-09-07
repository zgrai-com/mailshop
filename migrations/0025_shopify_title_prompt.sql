PRAGMA foreign_keys = ON;

ALTER TABLE user_ai_prompt_settings ADD COLUMN ai_title_prompt TEXT NOT NULL DEFAULT '';
