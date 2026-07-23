-- ── PostgreSQL 初始化脚本 ──
-- 在 docker compose 启动时自动执行

-- 用户表
CREATE TABLE IF NOT EXISTS users (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_seen   TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    chips       BIGINT DEFAULT 1000 NOT NULL,
    is_admin    BOOLEAN DEFAULT FALSE NOT NULL
);

-- 私人牌桌元数据表
CREATE TABLE IF NOT EXISTS private_tables (
    slug            TEXT PRIMARY KEY,
    table_id        TEXT NOT NULL UNIQUE,
    display_name    TEXT NOT NULL DEFAULT '',
    created_by      TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at      TIMESTAMP WITH TIME ZONE
);

-- 审计日志表
CREATE TABLE IF NOT EXISTS audit_log (
    id          BIGSERIAL PRIMARY KEY,
    event_type  TEXT NOT NULL,
    table_id    TEXT,
    player_id   TEXT,
    payload     JSONB NOT NULL DEFAULT '{}',
    created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_log_event_type ON audit_log(event_type);
CREATE INDEX IF NOT EXISTS idx_private_tables_slug ON private_tables(slug);
CREATE INDEX IF NOT EXISTS idx_users_name ON users(name);