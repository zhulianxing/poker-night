-- Poker Night — 商户认证 & 管理员表
-- 执行：psql -U poker -d poker_night -f server/migrations/003_merchant_admin.sql

-- ============================================================
-- 1. venues 表新增 email 和 password_hash 用于商户登录
-- ============================================================
ALTER TABLE venues ADD COLUMN IF NOT EXISTS email VARCHAR(255) UNIQUE;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);

-- ============================================================
-- 2. 管理员表
-- ============================================================
CREATE TABLE IF NOT EXISTS admins (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username      VARCHAR(50) NOT NULL UNIQUE,
  email         VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role          VARCHAR(20) DEFAULT 'admin',    -- admin / superadmin
  status        VARCHAR(20) DEFAULT 'active',
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 3. 初始测试数据
-- ============================================================

-- 更新测试场馆密码 (默认密码: poker123)
UPDATE venues
SET email = 'admin@testbar.com',
    password_hash = '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy'
WHERE name = '测试酒吧'
  AND email IS NULL;

-- 插入默认管理员 (admin@poker.com / admin123)
INSERT INTO admins (username, email, password_hash, role)
VALUES ('admin', 'admin@poker.com',
        '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',
        'superadmin')
ON CONFLICT (username) DO NOTHING;

-- 为已有 venue 但没有 email 的生成邮箱
UPDATE venues
SET email = 'merchant_' || replace(gen_random_uuid()::text, '-', '') || '@venue.com'
WHERE email IS NULL;

-- 为没有密码的 venue 设置默认密码 (poker123)
UPDATE venues
SET password_hash = '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy'
WHERE password_hash IS NULL;
