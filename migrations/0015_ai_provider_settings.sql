PRAGMA foreign_keys = ON;

ALTER TABLE ai_settings ADD COLUMN chat_base_url_ciphertext TEXT;
ALTER TABLE ai_settings ADD COLUMN chat_api_key_ciphertext TEXT;
ALTER TABLE ai_settings ADD COLUMN chat_model_id_ciphertext TEXT;
ALTER TABLE ai_settings ADD COLUMN image_generation_base_url_ciphertext TEXT;
ALTER TABLE ai_settings ADD COLUMN image_generation_api_key_ciphertext TEXT;
ALTER TABLE ai_settings ADD COLUMN image_generation_model_id_ciphertext TEXT;
