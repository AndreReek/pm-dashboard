-- PM Dashboard - Supabase Schema
-- Run this in the Supabase SQL Editor

-- Organizations
CREATE TABLE IF NOT EXISTS organizations (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Org members
CREATE TABLE IF NOT EXISTS org_members (
    id BIGSERIAL PRIMARY KEY,
    org_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    role TEXT NOT NULL DEFAULT 'member',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(org_id, user_id)
);

-- Settings (per org)
CREATE TABLE IF NOT EXISTS "Settings" (
    id BIGSERIAL PRIMARY KEY,
    org_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    key TEXT NOT NULL,
    value JSONB,
    UNIQUE(org_id, key)
);

-- Projects
CREATE TABLE IF NOT EXISTS projects (
    id BIGSERIAL PRIMARY KEY,
    org_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    nome TEXT NOT NULL,
    cliente TEXT DEFAULT 'General',
    mainStatus TEXT DEFAULT 'active',
    category TEXT,
    priorita TEXT DEFAULT 'media',
    ritardoGiorni INTEGER DEFAULT 0,
    statoQualita TEXT DEFAULT 'green',
    rischiAlti INTEGER DEFAULT 0,
    azioneRichiesta TEXT,
    supplyScope JSONB,
    milestones JSONB,
    dueDate DATE,
    stepDurations JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS: enable row-level security
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

-- RLS policies: users can only see data in their org
CREATE POLICY "org_members_self" ON org_members FOR ALL USING (user_id = auth.uid());
CREATE POLICY "organizations_member" ON organizations FOR ALL USING (
    id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid())
);
CREATE POLICY "settings_member" ON "Settings" FOR ALL USING (
    org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid())
);
CREATE POLICY "projects_member" ON projects FOR ALL USING (
    org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid())
);

-- Migrations: add columns to existing deployments
ALTER TABLE projects ADD COLUMN IF NOT EXISTS "stepDurations" JSONB;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS "dueDate" DATE;
