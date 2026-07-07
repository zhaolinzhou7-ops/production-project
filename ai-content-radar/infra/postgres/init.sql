-- AI Content Radar 初始化 DDL（核心表）。完整设计见 docs/02-database-design.md
-- 生产由 Alembic 迁移管理，本文件用于本地 docker-compose 首启。

CREATE TABLE IF NOT EXISTS tenants (
    id          BIGSERIAL PRIMARY KEY,
    name        VARCHAR(128) NOT NULL,
    plan        VARCHAR(32)  NOT NULL DEFAULT 'free',
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
    id            BIGSERIAL PRIMARY KEY,
    tenant_id     BIGINT REFERENCES tenants(id),
    email         VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role          VARCHAR(32)  NOT NULL DEFAULT 'member',
    is_active     BOOLEAN      NOT NULL DEFAULT true,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id);

CREATE TABLE IF NOT EXISTS contents (
    id             BIGSERIAL PRIMARY KEY,
    tenant_id      BIGINT REFERENCES tenants(id),
    platform       VARCHAR(16)  NOT NULL,
    external_id    VARCHAR(128) NOT NULL,
    title          TEXT DEFAULT '',
    caption        TEXT DEFAULT '',
    tags           JSONB DEFAULT '[]',
    published_at   TIMESTAMPTZ,
    likes          BIGINT DEFAULT 0,
    collects       BIGINT DEFAULT 0,
    shares         BIGINT DEFAULT 0,
    comments_count BIGINT DEFAULT 0,
    plays          BIGINT DEFAULT 0,
    duration_sec   INT DEFAULT 0,
    author_id      VARCHAR(128) DEFAULT '',
    embedding_id   VARCHAR(64),
    raw            JSONB DEFAULT '{}',
    fetched_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, platform, external_id)
);
CREATE INDEX IF NOT EXISTS idx_contents_platform ON contents(platform);
CREATE INDEX IF NOT EXISTS idx_contents_pub ON contents(published_at DESC);

CREATE TABLE IF NOT EXISTS comments (
    id           BIGSERIAL PRIMARY KEY,
    tenant_id    BIGINT REFERENCES tenants(id),
    content_id   BIGINT REFERENCES contents(id),
    text         TEXT NOT NULL,
    likes        INT DEFAULT 0,
    sentiment    REAL,
    published_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_comments_content ON comments(content_id);

CREATE TABLE IF NOT EXISTS tracks (
    id                BIGSERIAL PRIMARY KEY,
    tenant_id         BIGINT REFERENCES tenants(id),
    name              VARCHAR(64) NOT NULL,
    snapshot_date     DATE NOT NULL DEFAULT current_date,
    share             REAL DEFAULT 0,
    growth_rate       REAL DEFAULT 0,
    competition_index REAL DEFAULT 0,
    avg_engagement    REAL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_tracks_name ON tracks(tenant_id, name, snapshot_date);

CREATE TABLE IF NOT EXISTS opportunities (
    id         BIGSERIAL PRIMARY KEY,
    tenant_id  BIGINT REFERENCES tenants(id),
    name       VARCHAR(128) NOT NULL,
    base_track VARCHAR(64),
    cross      VARCHAR(64),
    score      REAL NOT NULL,
    demand     REAL DEFAULT 0,
    supply     REAL DEFAULT 0,
    growth     REAL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_opp_score ON opportunities(tenant_id, score DESC);

CREATE TABLE IF NOT EXISTS projects (
    id             BIGSERIAL PRIMARY KEY,
    tenant_id      BIGINT REFERENCES tenants(id),
    title          VARCHAR(255) NOT NULL,
    track          VARCHAR(64) DEFAULT '',
    cross          VARCHAR(64) DEFAULT '',
    status         VARCHAR(32) DEFAULT 'draft',
    payload        JSONB DEFAULT '{}',
    virality_score INT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id         BIGSERIAL PRIMARY KEY,
    tenant_id  BIGINT,
    user_id    BIGINT,
    action     VARCHAR(64) NOT NULL,
    target     VARCHAR(128) DEFAULT '',
    meta       JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(tenant_id, created_at DESC);

-- 演示租户
INSERT INTO tenants (name, plan) VALUES ('Demo Studio', 'pro') ON CONFLICT DO NOTHING;
