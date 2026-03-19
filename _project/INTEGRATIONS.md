# External Integrations

**Analysis Date:** 2026-03-05

## APIs & External Services
**Backend-as-a-Service:**
- Supabase — database, auth, realtime, and REST/PostgREST API
  - SDK/Client: `@supabase/supabase-js@2` loaded via jsDelivr CDN
  - Auth: Supabase anon (publishable) key hardcoded as `SUPABASE_KEY` constant in login.html and dashboard.html
  - Project URL: `https://ikgybeldlngntrpyzcnh.supabase.co`
  - WebSocket: `wss://ikgybeldlngntrpyzcnh.supabase.co` (realtime channel — declared in CSP, may not be actively used)

**CDN:**
- jsDelivr (`https://cdn.jsdelivr.net`) — delivers the Supabase JS client bundle at page load; no other packages served through it

## Data Storage
**Databases:**
- PostgreSQL via Supabase (managed, EU region)
  - Connection: handled by Supabase client using the hardcoded project URL + anon key; no direct DB connection string in front-end code
  - Client: `supabase.createClient()` from `@supabase/supabase-js@2`
  - Tables: `organizations`, `org_members`, `projects`, `Settings`
  - All columns use BIGSERIAL primary keys except `user_id` (UUID, from Supabase Auth)
  - JSONB columns: `supplyScope`, `milestones`, `stepDurations`, `value` (Settings)
  - RLS: enabled on all four tables; policies scope every query to the authenticated user's org via `org_members`

**Client-side Storage:**
- `localStorage` — persists user theme preference (`pm-theme` key); no sensitive data stored

## Authentication & Identity
**Auth Provider:**
- Supabase Auth — email/password only
  - Sign-up: `db.auth.signUp({ email, password })`
  - Sign-in: `db.auth.signInWithPassword({ email, password })`
  - Password reset: `db.auth.resetPasswordForEmail(email, { redirectTo: ... })`
  - Session check: `db.auth.getSession()` on every page load to guard routes
  - Sign-out: `db.auth.signOut()` on logout
  - No OAuth providers configured (no Google, GitHub, etc.)
  - No magic link / OTP configured
  - Email confirmation: supported but optional (code handles both confirmed and unconfirmed flows)

## Monitoring & Observability
**Error Tracking:** None — no Sentry, Datadog, or equivalent integrated
**Logs:** None — no server-side logging; errors surface to the user via in-page toast/error UI components only

## CI/CD & Deployment
**Hosting:** Vercel — static site auto-deployed from GitHub `main` branch
  - `_headers` file provides HTTP security headers at the CDN/edge layer
  - No `vercel.json` present; relies on Vercel's default static-site detection
**CI Pipeline:** None — no GitHub Actions, no test runner, no lint step; deploys on every push to `main`
**Repository:** https://github.com/AndreReek/pm-dashboard.git

## Environment Configuration
**Required env vars:** None at runtime — the front-end uses hardcoded publishable Supabase credentials (safe for client-side use under RLS)
**Secrets location:**
- No secrets committed; `.gitignore` excludes `*.env` and `.env.*`
- Supabase service-role key (if needed for admin tasks) must be managed exclusively in Supabase dashboard or a secure server context — it is NOT present in this codebase
- Any future server-side secrets (e.g., Stripe secret key) would need a server/edge function layer not currently present

---
*Integration audit: 2026-03-05*
