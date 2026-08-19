PRAGMA foreign_keys = ON;

ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'
  CHECK (role IN ('admin', 'user'));

UPDATE users SET role = 'admin' WHERE auth_provider = 'password';

CREATE INDEX idx_users_role_active ON users(role, is_active);
