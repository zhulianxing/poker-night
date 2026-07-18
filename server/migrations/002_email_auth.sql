-- Poker Night — 邮箱验证码认证迁移
-- 执行：psql -U poker -d poker_night -f server/migrations/002_email_auth.sql

-- ============================================================
-- 1. players 表新增 email 字段（向后兼容，保留 phone/password_hash）
-- ============================================================
ALTER TABLE players ADD COLUMN IF NOT EXISTS email VARCHAR(255) UNIQUE;

-- ============================================================
-- 2. 验证码表
-- ============================================================
CREATE TABLE IF NOT EXISTS email_codes (
  id          SERIAL PRIMARY KEY,
  email       VARCHAR(255) NOT NULL,
  code        VARCHAR(6) NOT NULL,
  purpose     VARCHAR(20) NOT NULL,  -- 'login' | 'register'
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '10 minutes',
  used         BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 3. 索引
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_email_codes_email ON email_codes(email);
CREATE INDEX IF NOT EXISTS idx_email_codes_expires ON email_codes(expires_at);
CREATE INDEX IF NOT EXISTS idx_email_codes_purpose ON email_codes(purpose);
