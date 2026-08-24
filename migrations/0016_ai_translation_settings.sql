PRAGMA foreign_keys = ON;

ALTER TABLE ai_settings ADD COLUMN translation_base_url_ciphertext TEXT;
ALTER TABLE ai_settings ADD COLUMN translation_api_key_ciphertext TEXT;
ALTER TABLE ai_settings ADD COLUMN translation_model_id_ciphertext TEXT;
