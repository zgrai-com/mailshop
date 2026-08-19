PRAGMA foreign_keys = ON;

ALTER TABLE integration_settings ADD COLUMN google_client_id_ciphertext TEXT;
ALTER TABLE integration_settings ADD COLUMN google_client_secret_ciphertext TEXT;
ALTER TABLE integration_settings ADD COLUMN google_allowed_domain_ciphertext TEXT;
