-- =============================================================================
-- Fieldline — RLS Paywall & Seat Limit Policies
-- File: rls-policies.sql
-- Run in: Supabase SQL Editor (as postgres / service_role)
-- Idempotent: safe to re-run; all policies are dropped then recreated.
-- =============================================================================
--
-- Plan limits (matches pricing in CLAUDE.md):
--   free   → 1 seat (owner only), 10 projects max
--   pro    → 5 seats max,         unlimited projects
--   studio → unlimited seats,     unlimited projects
--
-- NOTE: In PostgreSQL RLS policy expressions, new-row columns are referenced
-- directly by column name (e.g. `org_id`), NOT as `NEW.org_id`.
-- The NEW pseudo-record is only available in trigger functions, not in policies.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- SECTION 0 — Ensure RLS is enabled on every principal table
-- (idempotent no-ops if already enabled)
-- ---------------------------------------------------------------------------

ALTER TABLE organizations   ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_members     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Settings"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects        ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations     ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions   ENABLE ROW LEVEL SECURITY;


-- =============================================================================
-- SECTION 1 — PROJECT LIMIT (free plan: max 10 projects per org)
-- =============================================================================

DROP POLICY IF EXISTS "paywall_projects_insert" ON projects;

CREATE POLICY "paywall_projects_insert"
ON projects
FOR INSERT
WITH CHECK (
    -- The inserting user must belong to the target org
    org_id IN (
        SELECT org_id FROM org_members WHERE user_id = auth.uid()
    )
    AND (
        -- Pro/Studio: no project cap
        COALESCE(
            (SELECT plan FROM subscriptions WHERE subscriptions.org_id = projects.org_id),
            'free'
        ) IN ('pro', 'studio')
        OR
        -- Free: enforce 10-project hard cap
        (
            COALESCE(
                (SELECT plan FROM subscriptions WHERE subscriptions.org_id = projects.org_id),
                'free'
            ) = 'free'
            AND (
                SELECT COUNT(*) FROM projects p WHERE p.org_id = projects.org_id
            ) < 10
        )
    )
);


-- =============================================================================
-- SECTION 2 — INVITATION SEAT LIMIT
-- Table: invitations
-- =============================================================================

DROP POLICY IF EXISTS "paywall_invitations_insert" ON invitations;

CREATE POLICY "paywall_invitations_insert"
ON invitations
FOR INSERT
WITH CHECK (
    -- Only admins of this org can send invitations
    org_id IN (
        SELECT org_id FROM org_members
        WHERE user_id = auth.uid() AND role = 'admin'
    )
    AND invited_by = auth.uid()
    AND (
        -- Studio: unlimited
        COALESCE(
            (SELECT plan FROM subscriptions WHERE subscriptions.org_id = invitations.org_id),
            'free'
        ) = 'studio'
        OR
        -- Pro: max 5 seats (count existing members)
        (
            COALESCE(
                (SELECT plan FROM subscriptions WHERE subscriptions.org_id = invitations.org_id),
                'free'
            ) = 'pro'
            AND (
                SELECT COUNT(*) FROM org_members om WHERE om.org_id = invitations.org_id
            ) < 5
        )
        -- Free: no branch → INSERT always denied
    )
);


-- =============================================================================
-- SECTION 3 — ORG_MEMBERS SEAT LIMIT (hard wall on join)
-- =============================================================================

DROP POLICY IF EXISTS "paywall_org_members_insert" ON org_members;

CREATE POLICY "paywall_org_members_insert"
ON org_members
FOR INSERT
WITH CHECK (
    (
        -- Case A: First member (org owner bootstrap) — always allow
        (SELECT COUNT(*) FROM org_members om WHERE om.org_id = org_members.org_id) = 0
    )
    OR
    (
        -- Case B: Subsequent members — apply plan limits
        COALESCE(
            (SELECT plan FROM subscriptions WHERE subscriptions.org_id = org_members.org_id),
            'free'
        ) = 'studio'
        OR
        (
            COALESCE(
                (SELECT plan FROM subscriptions WHERE subscriptions.org_id = org_members.org_id),
                'free'
            ) = 'pro'
            AND (
                SELECT COUNT(*) FROM org_members om WHERE om.org_id = org_members.org_id
            ) < 5
        )
        -- Free: only Case A (owner) is allowed; all subsequent inserts denied
    )
);


-- =============================================================================
-- SECTION 4 — HARDEN INVITATIONS SELECT
-- Narrow open read to pending invitations only (reduces info leak)
-- =============================================================================

DROP POLICY IF EXISTS "invitations_token_lookup" ON invitations;

CREATE POLICY "invitations_token_lookup"
ON invitations
FOR SELECT
USING (accepted_at IS NULL);


-- =============================================================================
-- SECTION 5 — SUBSCRIPTIONS: explicit deny for client writes
-- (service_role via Stripe webhook is the only writer)
-- =============================================================================

DROP POLICY IF EXISTS "subscriptions_no_client_write" ON subscriptions;

CREATE POLICY "subscriptions_no_client_write"
ON subscriptions
FOR ALL
USING (false)
WITH CHECK (false);

-- =============================================================================
-- END OF FILE — paste into Supabase SQL Editor → Run
-- =============================================================================
