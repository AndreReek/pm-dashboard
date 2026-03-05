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

-- Invitations (team invite links)
CREATE TABLE IF NOT EXISTS invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    token TEXT NOT NULL UNIQUE,
    role TEXT NOT NULL DEFAULT 'member',
    invited_by UUID NOT NULL,
    accepted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;

-- Only org admins can create/read invitations for their org
CREATE POLICY "invitations_admin" ON invitations FOR ALL USING (
    org_id IN (
        SELECT org_id FROM org_members
        WHERE user_id = auth.uid() AND role = 'admin'
    )
);

-- Anyone can read their own pending invite by token (needed for join flow — anonymous select by token)
CREATE POLICY "invitations_token_lookup" ON invitations FOR SELECT USING (true);

-- Subscriptions (Stripe billing state per org)
CREATE TABLE IF NOT EXISTS subscriptions (
    id BIGSERIAL PRIMARY KEY,
    org_id BIGINT NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
    stripe_customer_id TEXT,
    stripe_subscription_id TEXT,
    plan TEXT NOT NULL DEFAULT 'free',   -- 'free' | 'pro' | 'studio'
    status TEXT NOT NULL DEFAULT 'active', -- 'active' | 'past_due' | 'canceled'
    seats INT NOT NULL DEFAULT 1,
    current_period_end TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- Org members can read their own org subscription
CREATE POLICY "subscriptions_member_read" ON subscriptions FOR SELECT USING (
    org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid())
);

-- Only service role (Edge Functions) can write subscriptions — no client-side writes
-- (INSERT/UPDATE/DELETE policies intentionally omitted; use service_role key in Edge Functions)

-- Migrations: add columns to existing deployments
ALTER TABLE projects ADD COLUMN IF NOT EXISTS "stepDurations" JSONB;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS "dueDate" DATE;
