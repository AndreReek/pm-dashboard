# Architecture

**Analysis Date:** 2026-03-05

## Pattern Overview
**Overall:** Monolithic Vanilla SPA — No-build, single-page application per route
**Key Characteristics:**
- Zero build step: raw HTML/CSS/JS files served directly via Vercel CDN
- All logic is co-located inside `<script>` tags within each HTML file
- Supabase is the only external runtime dependency (loaded from CDN)
- State is held entirely in module-level JavaScript variables per page
- No client-side router — navigation is full-page HTML file transitions
- RLS (Row-Level Security) enforced at the database layer; no server-side application code exists

## Layers

**Presentation Layer:**
- Purpose: Markup, layout, and visual component definitions
- Location: `index.html`, `login.html`, `dashboard.html`, `legal.html`
- Contains: HTML structure, inline `<style>` blocks per-page for page-specific styles, modal overlays, form elements, static content

**Shared Style Layer:**
- Purpose: Design system tokens, reusable component styles, responsive rules, animations
- Location: `styles.css`
- Contains: CSS custom properties (light/dark theme vars), layout primitives (sidebar, topbar, content-area), component classes (badges, cards, modals, forms, toast, workflow carousel), media queries

**Business Logic Layer:**
- Purpose: CRUD operations, health scoring, step timeline computation, settings management, auth guard, demo-project seeding
- Location: Inline `<script>` block inside `dashboard.html` (lines 173–839)
- Contains: `init()`, `fetchProjects()`, `renderProjects()`, `saveProject()`, `deleteProject()`, `getHealth()`, `computeCriticalPath()`, `renderCriticalPath()`, `updateStepDuration()`, `toggleStep()`, settings CRUD, toast utility, date utilities

**Auth Layer:**
- Purpose: Sign-in, registration, password reset, session check, org + settings provisioning
- Location: Inline `<script>` block inside `login.html` (lines 65–204)
- Contains: `handleLogin()`, `handleRegister()`, `handleForgotPassword()`, org creation, default settings cloning, redirect-on-session

**Database / Backend Layer:**
- Purpose: Persistent storage, auth, RLS access control
- Location: Supabase project `ikgybeldlngntrpyzcnh.supabase.co`; schema defined in `setup.sql`
- Contains: Tables: `organizations`, `org_members`, `projects`, `Settings`; RLS policies scoping all rows to the authenticated user's org; Supabase Auth for user identity

**Security / Headers Layer:**
- Purpose: HTTP security hardening applied at the CDN/edge level
- Location: `_headers` (Vercel headers file)
- Contains: CSP, HSTS, X-Frame-Options, Referrer-Policy, Permissions-Policy

## Data Flow

**Login / Registration Flow:**
1. User visits `login.html`; page checks existing session via `db.auth.getSession()`
2. If session exists, redirect immediately to `dashboard.html`
3. On register: create Supabase auth user → insert `organizations` row → insert `org_members` row → clone `DEFAULT_SETTINGS` into `Settings` table → redirect
4. On login: `db.auth.signInWithPassword()` → redirect to `dashboard.html`

**Dashboard Initialization Flow:**
1. `init()` called on page load
2. Auth guard: `db.auth.getSession()` — if no session, redirect to `login.html`
3. Fetch `org_members` to resolve `currentOrgId`; if none found, auto-provision org + settings
4. Update sidebar UI (avatar, email, org name)
5. `loadSettings()` — fetch all rows from `Settings` where `org_id = currentOrgId`; populate global arrays (`TECHS`, `BRANDS`, `STATUSES`, `WORKFLOW_STEPS`, `CATEGORIE`, `PRIORITA`)
6. `populateFormDropdowns()` — hydrate `<select>` elements with settings data
7. `fetchProjects()` — fetch all `projects` where `org_id = currentOrgId`; normalize legacy Italian field values; if empty, call `createDemoProject()`
8. `updateSummary()` — compute aggregate counts for summary cards
9. `renderProjects()` — generate all project card HTML and inject into DOM

**Project Save Flow:**
1. User submits modal form
2. `saveProject()` collects form values into a payload object
3. Upsert to Supabase (`insert` or `update` based on `editingId`)
4. On error related to missing `stepDurations` column, retries without that field (migration guard)
5. On success: toast, close modal, re-fetch + re-render

**Step Toggle / Duration Update Flow:**
1. User checks a workflow step checkbox → `toggleStep(projectId, index)`
2. Local `projects` array mutated immediately; `renderProjects()` called for instant UI feedback
3. Async Supabase `update` for `milestones` column persisted to DB
4. Duration input change → `updateStepDuration()` → mutate local array → `renderCriticalPath()` re-renders that panel inline → async DB persist

**Health Scoring Flow:**
1. `getHealth(p)` called per project during render
2. If all milestones done → "Complete"
3. If `dueDate` set: run `computeCriticalPath(p)` to get estimated end date for last active step; compare against `dueDate`; >10 days late = Critical, >0 = Attention, otherwise On Track
4. Fallback (no due date): derive from `statoQualita` + `rischiAlti` metric colors

**State Management:**
- Module-level mutable variables: `projects` (array), `editingId` (null|int), `currentOrgId` (int), `currentUser` (object), `currentOrgName` (string), `openTimelinePanels` (Set)
- Settings arrays: `TECHS`, `BRANDS`, `STATUSES`, `WORKFLOW_STEPS`, `CATEGORIE`, `PRIORITA` — loaded from DB at init, mutated in-place by settings CRUD
- Theme state persisted to `localStorage` under key `pm-theme`
- No reactive framework; UI updated by full DOM replacement via `innerHTML` on the project container, or targeted re-renders for Step Timeline panels

## Key Abstractions

**Supabase Client (`db`):**
- Purpose: Single shared reference to the Supabase JS client, used for all auth and DB calls
- Examples: `login.html` line 69, `dashboard.html` line 177 — both instantiate independently with the same URL/key

**DEFAULT_SETTINGS:**
- Purpose: Canonical in-code seed data for new organizations; cloned into the `Settings` table on registration and org auto-provisioning
- Examples: `login.html` lines 78–85, `dashboard.html` lines 254–261

**computeCriticalPath(p):**
- Purpose: Pure function that takes a project object and returns a step-by-step timeline array with ISO-week start/end labels and working-day calculations — the core scheduling engine
- Examples: `dashboard.html` lines 554–575

**getHealth(p):**
- Purpose: Pure function that derives project health level (critical/warning/healthy) from timeline estimate vs due date, with quality/risk fallback
- Examples: `dashboard.html` lines 525–551

**renderProjects():**
- Purpose: Full re-render of all project cards into `#projectsContainer`; groups by `mainStatus` then by `cliente`
- Examples: `dashboard.html` lines 634–728

## Entry Points

**`index.html` — Public Landing Page:**
- Location: `c:/Users/riccardi-a/Desktop/DEV/pm-dashboard/index.html`
- Responsibilities: Marketing page; no Supabase call; reads `pm-theme` from `localStorage` to apply theme; links to `login.html`

**`login.html` — Authentication Gate:**
- Location: `c:/Users/riccardi-a/Desktop/DEV/pm-dashboard/login.html`
- Responsibilities: Session check on load (redirect if already logged in); sign-in; registration with full org provisioning; password reset via Supabase email

**`dashboard.html` — Application Shell:**
- Location: `c:/Users/riccardi-a/Desktop/DEV/pm-dashboard/dashboard.html`
- Responsibilities: Auth guard; org resolution; settings load; project CRUD; health scoring; step timeline rendering; settings management modal; theme toggle

**`legal.html` — Static Legal Content:**
- Location: `c:/Users/riccardi-a/Desktop/DEV/pm-dashboard/legal.html`
- Responsibilities: Terms of Service and Privacy Policy; no JavaScript logic; anchor-linked sections `#tos` and `#privacy`

## Error Handling
**Strategy:** Try/catch wrapping all async Supabase calls; user-facing errors surfaced via toast notifications; console logging for debugging

**Patterns:**
- Auth errors in `login.html`: displayed inline in `#errorBox` div with `showError(msg)`
- Data fetch errors in `dashboard.html`: `fetchProjects()` catch renders an error empty-state in `#projectsContainer`
- Save errors: toast with error message; button re-enabled in `finally` block
- `saveProject()` has a column-existence retry guard: if save fails mentioning `stepDurations`, retries without that field
- Settings load has a hardcoded fallback default values block if the DB call fails
- Org provisioning: if user has no `org_members` row, auto-creates org + settings rather than failing

## Cross-Cutting Concerns

**Auth:** Supabase Auth with email/password. Session is JWT stored by Supabase in `localStorage`. Every protected page calls `db.auth.getSession()` on load and redirects to `login.html` if no session. No server-side session validation.

**Multi-tenancy / Data Isolation:** All DB tables have RLS policies that join through `org_members` to `auth.uid()`. Queries also explicitly filter by `org_id = currentOrgId` client-side. `org_id` is BIGINT (not UUID).

**Theme:** CSS custom properties switched via `data-theme` attribute on `<html>`. Toggle persisted to `localStorage['pm-theme']`. Landing page applies theme from `localStorage` via an inline script to prevent flash.

**Responsive Design:** `styles.css` has breakpoints at 1024px (summary grid collapses to 2-col, project body stacks) and 768px (sidebar off-canvas with backdrop overlay, mobile menu button visible).

**Validation:** Client-side only. Required HTML attributes on form inputs. Explicit checks for empty `orgName` in registration. No server-side validation beyond DB constraints.

---
*Architecture analysis: 2026-03-05*
