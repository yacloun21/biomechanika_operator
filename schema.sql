-- SportLab Operator Panel / PostgreSQL schema
-- Run this file once on your PostgreSQL server before starting the app.

CREATE TABLE IF NOT EXISTS operators (
  id BIGSERIAL PRIMARY KEY,
  login VARCHAR(100) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role VARCHAR(50) NOT NULL DEFAULT 'operator',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  full_name VARCHAR(255) NOT NULL,
  study_group VARCHAR(100) NOT NULL,
  photo_url TEXT,
  health_group VARCHAR(100) NOT NULL DEFAULT 'Основная',
  current_weight NUMERIC(6,2),
  current_height NUMERIC(6,2),
  current_health_index NUMERIC(6,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_measurements (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  operator_id BIGINT REFERENCES operators(id) ON DELETE SET NULL,
  weight NUMERIC(6,2),
  height NUMERIC(6,2),
  health_index NUMERIC(6,2),
  measured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_full_name ON users(full_name);
CREATE INDEX IF NOT EXISTS idx_users_study_group ON users(study_group);
CREATE INDEX IF NOT EXISTS idx_measurements_user_id_measured_at ON user_measurements(user_id, measured_at);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
CREATE TRIGGER trg_users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();
