# Codebase Structure

**Analysis Date:** 2026-03-05

## Directory Layout

```
pm-dashboard/                    # Project root — also Vercel deployment root
├── index.html                   # Public landing/marketing page
├── login.html                   # Auth page: sign-in, register, password reset
├── dashboard.html               # Main application (auth-guarded SPA shell)
├── legal.html                   # Static legal: Terms of Service + Privacy Policy
├── styles.css                   # Shared design system + all component styles
├── setup.sql                    # Supabase schema DDL + RLS policies + migrations
├── _headers                     # Vercel edge HTTP security headers (CSP, HSTS, etc.)
├── .gitignore                   # Git ignore rules
├── .claude/                     # Claude Code local config (not deployed)
│   ├── settings.json
│   └── settings.local.json
├── .git/                        # Git repository metadata
└── .planning/                   # Project planning docs (not deployed)
    └── codebase/
        ├── ARCHITECTURE.md
        └── STRUCTURE.md
```

## Key File Locations

**Entry Points:**
- `index.html`: Public landing page — first URL users hit; no auth required
- `login.html`: Authentication gate — sign-in / register / forgot password
- `dashboard.html`: Protected application shell — all project management functionality
- `legal.html`: Static legal content — linked from footer and registration form

**Configuration:**
- `setup.sql`: All DB schema, RLS policies, and column migration statements; run in Supabase SQL editor to set up or update the schema
- `_headers`: Vercel-specific HTTP headers file applied globally to all routes; controls CSP, HSTS, framing policy
- `.gitignore`: Currently minimal; excludes nothing beyond defaults

**Core Logic:**
- `dashboard.html` `<script>` block (lines 173–839): Entire application logic — auth guard, data fetching, rendering, health scoring, timeline computation, settings management
- `login.html` `<script>` block (lines 65–204): Auth flows + org provisioning on new account creation
- `styles.css`: Design system — CSS custom properties for theming, all shared component classes

**Supabase Credentials (hardcoded, publishable-key safe):**
- URL: `https://ikgybeldlngntrpyzcnh.supabase.co` — present in both `login.html` and `dashboard.html`
- Key: `sb_publishable_RodF4T3p7nW1AVdkAmm3Lg_78pL2uPv` — anon/publishable key; security enforced by RLS at DB level

## Naming Conventions

**Files:** Lowercase kebab-case HTML files (`index.html`, `login.html`, `dashboard.html`, `legal.html`). Single CSS file (`styles.css`). SQL file mirrors purpose (`setup.sql`). Vercel config files use Vercel-native naming (`_headers`).

**CSS Classes:** BEM-lite naming. Page-scoped prefixes for landing page styles (`lp-*`): `lp-nav`, `lp-hero`, `lp-feature`. Component-level descriptive names: `project-card`, `project-header`, `aside-panel`, `workflow-carousel`, `summary-card`. State modifiers as suffixed classes: `active`, `cp-open`, `cp-done`, `cp-active`. Color/status classes: `badge-high`, `badge-medium`, `badge-low`, `status-ordered`, `status-delivered`, `health-dot`, `health-critical`.

**JavaScript Functions:** camelCase throughout. Verb-noun pattern for actions: `fetchProjects()`, `renderProjects()`, `saveProject()`, `deleteProject()`, `toggleStep()`, `openAddModal()`, `closeModal()`. Prefixed getters: `getHealth()`, `getMetricColor()`, `getSettingsArray()`. Prefixed handlers: `handleLogin()`, `handleRegister()`, `handleForgotPassword()`, `handleLogout()`.

**Database Columns:** Mixed Italian legacy names and English names in `projects` table: `nome` (name), `cliente` (client), `priorita` (priority), `ritardoGiorni` (delay days), `statoQualita` (quality status), `rischiAlti` (high risks), `azioneRichiesta` (action required). Newer columns are English: `mainStatus`, `category`, `supplyScope`, `milestones`, `dueDate`, `stepDurations`. The `Settings` table uses English `key` values: `tecnologie`, `brand`, `stati_fornitura`, `workflow_steps`, `categorie`, `priorita`.

**Settings Keys:** `tecnologie`, `brand`, `stati_fornitura`, `workflow_steps`, `categorie`, `priorita` — Italian-origin keys, normalized to English arrays in the runtime.

## Where to Add New Code

**New Feature (project-level data field):**
1. Add column to `projects` table: add `ALTER TABLE projects ADD COLUMN IF NOT EXISTS ...` to `setup.sql` and run in Supabase
2. Add form input to the project modal in `dashboard.html` (the `<div id="modal">` block, lines 99–158)
3. Include the new field in `saveProject()` payload object (around line 454)
4. Render the field in `renderProjects()` card HTML template (around line 670)
5. Add any associated CSS to `styles.css`

**New Configurable Setting (org-level list):**
1. Add a new key to `DEFAULT_SETTINGS` array in both `login.html` (line 78) and `dashboard.html` (line 254)
2. Declare a new global array variable at the top of the dashboard script (line 187 block)
3. Add a case to `loadSettings()` switch statement (around line 335)
4. Add the key to `SETTINGS_LABELS` map (line 189), `getSettingsArray()` (line 801), and `setSettingsArray()` (line 803)

**New Page:**
1. Create `newpage.html` in the project root
2. Add `<link rel="stylesheet" href="styles.css">` and `<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>` in `<head>`
3. Add auth guard at top of inline script if the page is protected: replicate the `db.auth.getSession()` + redirect pattern from `dashboard.html` lines 264–273
4. Add navigation link in relevant pages (`dashboard.html` sidebar nav or `index.html` nav)
5. No routing config needed — Vercel serves HTML files directly by filename

**New Modal (dashboard):**
1. Add a `<div class="modal-overlay" id="myModal">` block inside `dashboard.html` body (after the existing modals, before `</body>`)
2. Add open/close functions following the `openSettingsModal()` / `closeSettingsModal()` pattern (lines 780–785)
3. Wire trigger button in the topbar or card actions

**New CSS Component:**
- Add to `styles.css` with a descriptive comment block header matching the existing `/* ---- COMPONENT NAME ---- */` pattern
- Use existing CSS custom properties (`var(--primary)`, `var(--border)`, `var(--card)`, etc.) — do not hardcode colors

**New DB Table:**
1. Add `CREATE TABLE IF NOT EXISTS` + `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` + `CREATE POLICY` statements to `setup.sql`
2. RLS policy must join through `org_members WHERE user_id = auth.uid()` to enforce org isolation
3. `org_id` must be `BIGINT` (not UUID) referencing `organizations(id)`

---
*Structure analysis: 2026-03-05*
