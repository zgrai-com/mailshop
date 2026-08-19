PRAGMA foreign_keys = ON;

ALTER TABLE users ADD COLUMN auth_provider TEXT NOT NULL DEFAULT 'password'
  CHECK (auth_provider IN ('password', 'google'));
ALTER TABLE users ADD COLUMN google_sub TEXT;
ALTER TABLE users ADD COLUMN email TEXT COLLATE NOCASE;
ALTER TABLE users ADD COLUMN avatar_url TEXT;

CREATE UNIQUE INDEX idx_users_google_sub ON users(google_sub) WHERE google_sub IS NOT NULL;
CREATE UNIQUE INDEX idx_users_email ON users(email) WHERE email IS NOT NULL;

CREATE TABLE credit_wallets (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  balance INTEGER NOT NULL DEFAULT 10000 CHECK (balance >= 0),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE credit_transactions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL CHECK (amount != 0),
  balance_after INTEGER NOT NULL CHECK (balance_after >= 0),
  reason TEXT NOT NULL,
  reference_id TEXT,
  detail_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(detail_json)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_credit_transactions_user_created
  ON credit_transactions(user_id, created_at DESC);
CREATE UNIQUE INDEX idx_credit_transactions_reference
  ON credit_transactions(user_id, reason, reference_id) WHERE reference_id IS NOT NULL;

CREATE TABLE oauth_states (
  state_hash TEXT PRIMARY KEY,
  code_verifier TEXT NOT NULL,
  redirect_uri TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_oauth_states_expires ON oauth_states(expires_at);

CREATE TRIGGER users_create_credit_wallet
AFTER INSERT ON users
BEGIN
  INSERT INTO credit_wallets (user_id, balance) VALUES (NEW.id, 10000);
  INSERT INTO credit_transactions (id, user_id, amount, balance_after, reason, reference_id)
  VALUES (lower(hex(randomblob(16))), NEW.id, 10000, 10000, 'account.signup', NEW.id);
END;

INSERT OR IGNORE INTO credit_wallets (user_id, balance)
SELECT id, 10000 FROM users
;

INSERT OR IGNORE INTO credit_transactions (id, user_id, amount, balance_after, reason, reference_id)
SELECT lower(hex(randomblob(16))), id, 10000, 10000, 'account.migration', id FROM users
;
