-- =======================================================
-- SanitovaCredits - Database Schema
-- PostgreSQL
-- =======================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =======================================================
-- ROLES
-- =======================================================
CREATE TABLE IF NOT EXISTS roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(50) NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =======================================================
-- USERS
-- =======================================================
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    organization VARCHAR(255),
    avatar_url TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role_id);

-- =======================================================
-- COMPLIANCE ASSETS
-- =======================================================
CREATE TABLE IF NOT EXISTS compliance_assets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    asset_type VARCHAR(100) NOT NULL,
    title VARCHAR(500) NOT NULL,
    description TEXT,
    issuer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    current_holder_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(50) NOT NULL DEFAULT 'created',
    location VARCHAR(500),
    metadata JSONB NOT NULL DEFAULT '{}',
    issued_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_assets_issuer ON compliance_assets(issuer_id);
CREATE INDEX IF NOT EXISTS idx_assets_holder ON compliance_assets(current_holder_id);
CREATE INDEX IF NOT EXISTS idx_assets_status ON compliance_assets(status);
CREATE INDEX IF NOT EXISTS idx_assets_type ON compliance_assets(asset_type);
CREATE INDEX IF NOT EXISTS idx_assets_created ON compliance_assets(created_at);

-- =======================================================
-- ASSET STATUS HISTORY
-- =======================================================
CREATE TABLE IF NOT EXISTS asset_status_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    asset_id UUID NOT NULL REFERENCES compliance_assets(id) ON DELETE CASCADE,
    status VARCHAR(50) NOT NULL,
    changed_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metadata JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_status_history_asset ON asset_status_history(asset_id);
CREATE INDEX IF NOT EXISTS idx_status_history_changed_at ON asset_status_history(changed_at);

-- =======================================================
-- ASSET EVENTS (AUDIT LOG)
-- =======================================================
CREATE TABLE IF NOT EXISTS asset_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    asset_id UUID NOT NULL REFERENCES compliance_assets(id) ON DELETE CASCADE,
    event_type VARCHAR(50) NOT NULL,
    event_description TEXT NOT NULL,
    actor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    actor_role VARCHAR(50) NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_events_asset ON asset_events(asset_id);
CREATE INDEX IF NOT EXISTS idx_events_actor ON asset_events(actor_id);
CREATE INDEX IF NOT EXISTS idx_events_type ON asset_events(event_type);
CREATE INDEX IF NOT EXISTS idx_events_created ON asset_events(created_at);

-- =======================================================
-- AUDIT REPORTS
-- =======================================================
CREATE TABLE IF NOT EXISTS audit_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    report_type VARCHAR(100) NOT NULL,
    title VARCHAR(500) NOT NULL,
    description TEXT,
    generated_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    filters JSONB,
    result_count INTEGER NOT NULL DEFAULT 0,
    file_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reports_generated_by ON audit_reports(generated_by);
CREATE INDEX IF NOT EXISTS idx_reports_created ON audit_reports(created_at);
