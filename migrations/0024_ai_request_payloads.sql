PRAGMA foreign_keys = ON;

ALTER TABLE ai_request_logs ADD COLUMN request_payload_json TEXT NOT NULL DEFAULT '{}'
  CHECK (json_valid(request_payload_json));

ALTER TABLE ai_request_logs ADD COLUMN response_payload_json TEXT NOT NULL DEFAULT '{}'
  CHECK (json_valid(response_payload_json));
