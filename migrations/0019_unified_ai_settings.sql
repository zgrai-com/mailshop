PRAGMA foreign_keys = ON;

ALTER TABLE ai_settings ADD COLUMN conversation_base_url_ciphertext TEXT;
ALTER TABLE ai_settings ADD COLUMN conversation_api_key_ciphertext TEXT;
ALTER TABLE ai_settings ADD COLUMN image_filter_model_id_ciphertext TEXT;
ALTER TABLE ai_settings ADD COLUMN image_analysis_model_id_ciphertext TEXT;

-- Preserve existing encrypted values while making the new columns canonical.
UPDATE ai_settings
SET
  conversation_base_url_ciphertext = COALESCE(
    conversation_base_url_ciphertext,
    chat_base_url_ciphertext,
    base_url_ciphertext,
    translation_base_url_ciphertext
  ),
  conversation_api_key_ciphertext = COALESCE(
    conversation_api_key_ciphertext,
    chat_api_key_ciphertext,
    api_key_ciphertext,
    translation_api_key_ciphertext
  ),
  image_filter_model_id_ciphertext = COALESCE(
    image_filter_model_id_ciphertext,
    model_id_ciphertext,
    chat_model_id_ciphertext,
    translation_model_id_ciphertext
  ),
  image_analysis_model_id_ciphertext = COALESCE(
    image_analysis_model_id_ciphertext,
    chat_model_id_ciphertext,
    model_id_ciphertext,
    translation_model_id_ciphertext
  )
WHERE id = 1;
