# Architecture

**Last updated:** 2026-03-19

---

## 1. Overview

PM Dashboard is a multi-tenant project management SaaS built without a server-side application layer. The architecture is deliberately minimal: static files served from a CDN, a managed Postgres database with Row-Level Security handling all access control, and three Deno Edge Functions for billing operations that require server-side secrets.

**Architectural style:** No-build static SPA + Supabase BaaS + Stripe billing via Edge Functions

### System layers

```
+----------------------------------------------------------+
|                      BROWSER (Client)                    |
|                                                          |
|  index.html     login.html    dashboard.html             |
|  (landing)      (auth gate)   (app shell)                |
|                                                          |
|  Vanilla JS inline scripts — no framework, no build step |
|  State: module-level variables, localStorage for theme   |
+---------------------------+------------------------------+
                            |
                 HTTPS / Supabase JS SDK v2
                 (loaded from jsDelivr CDN)
                            |
+---------------------------v------------------------------+
|                   SUPABASE (BaaS)                        |
|                                                          |
|  +------------------+   +-----------------------------+  |
|  |  Supabase Auth   |   |  PostgreSQL + PostgREST     |  |
|  |  email+password  |   |  RLS on all tables          |  |
|  |  JWT session     |   |  REST API (no raw SQL)      |  |
|  +------------------+   +-----------------------------+  |
|                                                          |
|  +--------------------------------------------------+   |
|  |  Edge Functions (Deno runtime)                   |   |
|  |  create-checkout | stripe-webhook | billing-portal|   |
|  +--------------------------------------------------+   |
+---------------------------+------------------------------+
                            |
                     Stripe API (HTTPS)
                            |
+---------------------------v------------------------------+
|                      STRIPE                              |
|  Checkout sessions, subscriptions, billing portal        |
|  Webhooks -> stripe-webhook Edge Function                |
+----------------------------------------------------------+
```

### Data flow — end to end

```
User action (browser)
       |
       v
Supabase JS client (anon key + JWT)
       |
       |-- Auth calls --> Supabase Auth service
       |-- DB calls ----> PostgREST API --> PostgreSQL (RLS enforced)
       |-- Billing -----> Edge Function --> Stripe API
                                |
                         Stripe Webhook
                                |
                         stripe-webhook Edge Function
                                |
                         subscriptions table (service_role key)
```

---

## 2. Frontend

### Stack

- **HTML5** — one file per route, no templating engine
- **CSS3** — single shared `styles.css` + per-page inline `<style>` blocks
- **JavaScript ES2020+** — inline `<script>` blocks at the bottom of each HTML file; no modules, no build step
- **@supabase/supabase-js@2** — only external dependency, loaded from jsDelivr CDN at runtime

No framework, no bundler, no transpiler. The Vercel deployment root is the project root; every `.html` file is a route.

### File responsibilities

| File | Role | Auth required |
|---|---|---|
| `index.html` | Public marketing/landing page. Reads `pm-theme` from `localStorage` to apply theme. No Supabase calls. | No |
| `login.html` | Auth gate: sign-in, registration (with org provisioning), password reset, email verification check. Redirects to `dashboard.html` if session exists. | No (creates session) |
| `dashboard.html` | Full application shell: auth guard, org resolution, settings load, project CRUD, health scoring, step timeline, Gantt launch, billing UI. | Yes |
| `reset-password.html` | Password reset landing page: detects `type=recovery` token in URL hash, presents new-password form. | Recovery token |
| `join.html` | Team invitation acceptance: reads invite token from URL, validates against `invitations` table, adds user to org. | Optional (new or existing user) |
| `gantt.html` | Gantt chart renderer, embedded as an `<iframe>` inside `dashboard.html`. Receives project data via `postMessage`. | Sandboxed (no Supabase) |
| `legal.html` | Static Terms of Service and Privacy Policy. No JavaScript. | No |
| `styles.css` | Design system: CSS custom properties (light/dark tokens), layout primitives, all shared components (cards, modals, badges, toast, forms). | — |

### Communication between files

- **Standard navigation** — full-page loads via `window.location.href` or `<a href>`. No client-side router.
- **Gantt iframe** — `dashboard.html` embeds `gantt.html` in an `<iframe>` and sends project data with `iframe.contentWindow.postMessage(payload, '*')`. The Gantt page listens with `window.addEventListener('message', ...)` and renders the chart from the received payload. No Supabase calls inside the iframe.
- **Theme** — persisted to `localStorage['pm-theme']`; `index.html` applies it via an inline script before page paint to prevent flash.
- **Billing callbacks** — Stripe redirects back to `dashboard.html?upgrade=success` or `dashboard.html?upgrade=cancel`; the dashboard reads `URLSearchParams` on load to show the appropriate toast.

### Patterns used

**Inline script architecture:** All JavaScript lives in a single `<script>` block at the bottom of each HTML file. No ES modules, no `import/export`. The Supabase client (`db`) is created via the global `supabase.createClient()` injected by the CDN script tag.

**Manual state management:** Module-level mutable variables hold all runtime state. No reactive framework. State variables in `dashboard.html`:
- `projects` (array) — the working set loaded from DB
- `editingId` (number|null) — which project modal is in edit mode
- `currentOrgId` (number) — resolved at init, scopes all DB queries
- `currentUser` (object) — Supabase auth user object
- `currentOrgName` (string) — displayed in sidebar
- `openTimelinePanels` (Set) — which step-timeline panels are expanded; persisted across re-renders

**Render functions:** UI is updated by replacing `innerHTML` on container elements. `renderProjects()` is the primary render function: it clears `#projectsContainer` and rebuilds all project cards from the current `projects` array. Partial re-renders exist only for the step-timeline panel (`renderCriticalPath()`).

**Naming conventions:** Functions follow verb-noun camelCase (`fetchProjects`, `renderProjects`, `saveProject`, `deleteProject`). Handler functions are prefixed `handle*`. Render functions are prefixed `render*`. Constants use SCREAMING_SNAKE_CASE. CSS sections use `/* ---- SECTION ---- */` delimiters. Script sections use `// ---- SECTION ----`.

---

## 3. Database (Supabase PostgreSQL)

### Schema

```sql
organizations
  id            BIGSERIAL PRIMARY KEY
  name          TEXT NOT NULL
  created_at    TIMESTAMPTZ DEFAULT NOW()

org_members
  id            BIGSERIAL PRIMARY KEY
  org_id        BIGINT REFERENCES organizations(id) ON DELETE CASCADE
  user_id       UUID  (= auth.uid(), from Supabase Auth)
  role          TEXT DEFAULT 'member'   -- 'admin' | 'member'
  created_at    TIMESTAMPTZ DEFAULT NOW()
  UNIQUE(org_id, user_id)

"Settings"                              -- note: PascalCase, requires quoting
  id            BIGSERIAL PRIMARY KEY
  org_id        BIGINT REFERENCES organizations(id) ON DELETE CASCADE
  key           TEXT NOT NULL           -- e.g. 'workflow_steps', 'tecnologie'
  value         JSONB                   -- array of strings
  UNIQUE(org_id, key)

projects
  id            BIGSERIAL PRIMARY KEY
  org_id        BIGINT REFERENCES organizations(id) ON DELETE CASCADE
  nome          TEXT NOT NULL           -- Italian legacy: project name
  cliente       TEXT DEFAULT 'General'  -- Italian legacy: client name
  mainStatus    TEXT DEFAULT 'active'   -- 'active' | 'closed' | 'hold'
  category      TEXT
  priorita      TEXT DEFAULT 'media'    -- Italian: 'alta' | 'media' | 'bassa'
  ritardoGiorni INTEGER DEFAULT 0       -- Italian: delay days
  statoQualita  TEXT DEFAULT 'green'    -- Italian: 'green'|'yellow'|'red'
  rischiAlti    INTEGER DEFAULT 0       -- Italian: high risk count
  azioneRichiesta TEXT                  -- Italian: required action note
  supplyScope   JSONB                   -- array of supply item objects
  milestones    JSONB                   -- boolean array, one per workflow step
  dueDate       DATE
  stepDurations JSONB                   -- integer array, working days per step
  ganttData     JSONB                   -- reserved for gantt rendering data
  created_at    TIMESTAMPTZ DEFAULT NOW()

invitations
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid()
  org_id        BIGINT REFERENCES organizations(id) ON DELETE CASCADE
  email         TEXT NOT NULL
  token         TEXT NOT NULL UNIQUE
  role          TEXT DEFAULT 'member'
  invited_by    UUID
  accepted_at   TIMESTAMPTZ
  created_at    TIMESTAMPTZ DEFAULT NOW()

subscriptions
  id                    BIGSERIAL PRIMARY KEY
  org_id                BIGINT UNIQUE REFERENCES organizations(id) ON DELETE CASCADE
  stripe_customer_id    TEXT
  stripe_subscription_id TEXT
  plan                  TEXT DEFAULT 'free'    -- 'free' | 'pro' | 'studio'
  status                TEXT DEFAULT 'active'  -- 'active' | 'past_due' | 'canceled'
  seats                 INT DEFAULT 1
  current_period_end    TIMESTAMPTZ
  created_at            TIMESTAMPTZ DEFAULT NOW()
  updated_at            TIMESTAMPTZ DEFAULT NOW()
```

### Relations

```
organizations 1---n org_members (user_id -> auth.users)
organizations 1---n projects
organizations 1---n "Settings"
organizations 1---n invitations
organizations 1---1 subscriptions
```

### Key type decisions

- Primary keys are `BIGSERIAL` (not UUID) across all tables except `invitations` (UUID, for unguessable invite tokens).
- `org_members.user_id` is `UUID` to match Supabase Auth's `auth.users.id`.
- JSONB columns (`supplyScope`, `milestones`, `stepDurations`, `ganttData`, `value`) store structured arrays where evolving schemas would otherwise require repeated ALTER TABLE migrations.

---

## 4. RLS Strategy

Row-Level Security is the sole access-control enforcement layer. There is no server-side application code to validate queries.

### Policy summary

| Table | Policy name | Permitted operations | Condition |
|---|---|---|---|
| `org_members` | `org_members_self` | ALL | `user_id = auth.uid()` |
| `organizations` | `organizations_member` | ALL | `id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid())` |
| `"Settings"` | `settings_member` | ALL | `org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid())` |
| `projects` | `projects_member` | ALL | `org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid())` |
| `invitations` | `invitations_admin` | ALL | `org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid() AND role = 'admin')` |
| `invitations` | `invitations_token_lookup` | SELECT | `true` (public — needed for token-based join flow) |
| `subscriptions` | `subscriptions_member_read` | SELECT | `org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid())` |
| `subscriptions` | *(none for INSERT/UPDATE/DELETE)* | — | Writes only via `service_role` key in Edge Functions |

### Multi-tenancy pattern

Every data table carries an `org_id BIGINT` column referencing `organizations(id)`. The RLS policies enforce that a user can only access rows where `org_id` matches an org the user belongs to, resolved through `org_members`. The client also passes `org_id` explicitly in every query as a defense-in-depth filter, but this is redundant to RLS — RLS alone would be sufficient.

The `subscriptions` table write-path is intentionally restricted: INSERT/UPDATE/DELETE policies are absent for the anon/user role. Only the Deno Edge Functions using the `SUPABASE_SERVICE_ROLE_KEY` can modify subscription state, making it tamper-proof from client code.

---

## 5. Auth

### Provider

Supabase Auth with email + password only. No OAuth, no magic link, no OTP.

### Session management

The Supabase JS client stores the JWT session in `localStorage` automatically. Every protected page runs this guard at the top of its `init()` function:

```js
const { data: { session } } = await db.auth.getSession();
if (!session) { window.location.href = 'login.html'; return; }
```

There is no server-side session validation. Route protection is purely client-side; the actual data protection is RLS.

### Email verification

Supabase can be configured to require email confirmation before a session is issued. When email confirmation is enabled, `db.auth.signUp()` returns `{ data: { session: null } }`. The registration handler in `login.html` detects this and shows a "Check your email" message instead of redirecting. If email confirmation is disabled (development), users are signed in immediately.

### Registration + org provisioning flow

```
1. User submits registration form
2. db.auth.signUp({ email, password })
   - If session is null: show "verify your email" message -> stop
   - If session exists: continue
3. INSERT INTO organizations (name) -> get org.id
4. INSERT INTO org_members (org_id, user_id, role='admin')
5. INSERT INTO "Settings" rows (clone DEFAULT_SETTINGS for the new org)
6. Redirect to dashboard.html
```

If the user has a valid session but no `org_members` row (e.g., org creation failed mid-flow), `dashboard.html` auto-provisions an org using the email domain as org name and re-seeds the settings. This is a recovery guard, not the primary flow.

### Full auth flow

```
index.html
    |
    +-- "Sign in" link --> login.html
                               |
                               +-- existing session? --> dashboard.html
                               |
                               +-- login: signInWithPassword --> dashboard.html
                               |
                               +-- register: signUp --> org provision --> dashboard.html
                               |
                               +-- forgot password: resetPasswordForEmail
                                       |
                               email with reset link
                                       |
                               reset-password.html (detects type=recovery token)
                                       |
                               user sets new password --> dashboard.html
```

---

## 6. Billing (Stripe)

### Plan map

| Stripe Price ID | Plan | Seats | Project limit |
|---|---|---|---|
| `price_1T7f8CFAY0SgGV6JuTDa4ZZl` | `pro` | 5 | Unlimited |
| `price_1T7f8RFAY0SgGV6JzfQSGvaP` | `studio` | 999 | Unlimited |
| *(no price ID)* | `free` | 1 | Enforced client-side |

### Edge Functions

Three Deno functions deployed to Supabase Edge (`/functions/v1/`):

**`create-checkout`**
- Triggered by: user clicking "Upgrade" in `dashboard.html`
- Auth: validates user JWT via `supabase.auth.getUser()` using the `Authorization` header
- Logic: resolves `org_id` from `org_members`; looks up or creates a Stripe Customer; creates a `stripe.checkout.sessions` in subscription mode; returns the Checkout session URL
- The client redirects `window.location.href = session.url`

**`stripe-webhook`**
- Triggered by: Stripe (no user JWT — webhook is unauthenticated, verified by signature)
- Auth: `stripe.webhooks.constructEventAsync(body, sig, STRIPE_WEBHOOK_SECRET)` — rejects any tampered payload
- Events handled:
  - `checkout.session.completed` — upserts `subscriptions` with plan, customer ID, subscription ID, seats, period end
  - `customer.subscription.updated` — updates plan, status, seats, period end
  - `customer.subscription.deleted` — resets to `plan='free'`, `status='canceled'`, `seats=1`
- Uses `SUPABASE_SERVICE_ROLE_KEY` to write to `subscriptions` (bypasses RLS)
- `org_id` is carried through Stripe `metadata` set at checkout creation

**`billing-portal`**
- Triggered by: user clicking "Manage Billing" in `dashboard.html`
- Auth: same JWT validation as `create-checkout`
- Logic: resolves `stripe_customer_id` from `subscriptions`; creates an inline Billing Portal configuration (no Stripe Dashboard setup required); returns portal session URL
- Portal features: invoice history, payment method update, subscription cancellation. Subscription plan changes are disabled (must go through a new checkout).

### Checkout flow (end to end)

```
dashboard.html
  "Upgrade" button clicked
       |
       v
POST /functions/v1/create-checkout
  { plan: 'pro' | 'studio' }
  Authorization: Bearer <user JWT>
       |
       +-- validate JWT -> get user
       +-- resolve org_id from org_members
       +-- lookup/create Stripe Customer
       +-- create Stripe Checkout Session
       |
       return { url: "https://checkout.stripe.com/..." }
       |
       v
window.location.href = url
  (browser redirected to Stripe-hosted checkout)
       |
  User completes payment
       |
Stripe -> POST /functions/v1/stripe-webhook
  Event: checkout.session.completed
       |
       +-- verify webhook signature
       +-- retrieve subscription from Stripe
       +-- resolve plan from PLAN_MAP[priceId]
       +-- upsert subscriptions table (service_role)
       |
Stripe redirects -> dashboard.html?upgrade=success
       |
dashboard.html reads URLSearchParams, shows success toast
dashboard.html re-fetches subscription -> UI updates to paid plan
```

### Paywall enforcement

Two independent layers enforce plan limits:

**Client-side gate (UX):** `dashboard.html` fetches the org's `subscriptions` row on init and checks `plan` and `seats` before allowing certain actions (e.g., creating a project beyond the free tier limit, inviting team members). If the gate is triggered, it opens the upgrade modal.

**Server-side gate (tamper-proof):** The `subscriptions` table has no INSERT/UPDATE/DELETE policies for the authenticated user role. A user cannot elevate their own plan by calling the Supabase REST API directly — only the webhook Edge Function (using the service role key) can write subscription state. RLS enforces this at the database level.

### Required secrets (Supabase Edge Function environment)

| Secret | Used by |
|---|---|
| `STRIPE_SECRET_KEY` | create-checkout, billing-portal, stripe-webhook |
| `STRIPE_WEBHOOK_SECRET` | stripe-webhook (signature verification) |
| `STRIPE_PRO_PRICE_ID` | create-checkout |
| `STRIPE_STUDIO_PRICE_ID` | create-checkout |
| `SITE_URL` | create-checkout, billing-portal (redirect URLs) |
| `SUPABASE_URL` | all three functions (auto-injected by Supabase) |
| `SUPABASE_ANON_KEY` | create-checkout, billing-portal (user JWT validation) |
| `SUPABASE_SERVICE_ROLE_KEY` | create-checkout, stripe-webhook (admin DB writes) |

---

## 7. Deployment

### Vercel (frontend)

- **Type:** Static site — no serverless functions on Vercel
- **Deploy trigger:** Push to `main` branch on GitHub (`https://github.com/AndreReek/pm-dashboard.git`)
- **Build:** None. `vercel.json` sets `"buildCommand": null`, `"outputDirectory": "."`, `"framework": null`
- **Routing:** `vercel.json` routes `^/([^.]+)$` to `/$1.html`, enabling clean URLs (`/dashboard` -> `dashboard.html`). Root `/` maps to `index.html`.
- **Headers:** Defined in `vercel.json` under `"headers"` (supersedes `_headers` file). Applied globally with a dedicated override for `/gantt.html`.

### Supabase (backend)

- **Region:** EU
- **Project URL:** `https://ikgybeldlngntrpyzcnh.supabase.co`
- **Edge Functions:** Deployed via Supabase CLI (`supabase functions deploy <name>`). Runtime: Deno.
- **Secrets:** Managed via `supabase secrets set KEY=value`. Never committed to the repository.
- **Schema changes:** Run SQL statements from `setup.sql` in the Supabase SQL Editor. The file includes `IF NOT EXISTS` guards and `ADD COLUMN IF NOT EXISTS` migration statements so it is safe to re-run.

### CI/CD

None. There is no GitHub Actions pipeline, no test runner, and no lint step. Every push to `main` auto-deploys to Vercel. Edge Function deployments are manual via Supabase CLI.

---

## 8. Security

### HTTP security headers

Set globally via `vercel.json` for all routes:

| Header | Value | Purpose |
|---|---|---|
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains; preload` | Force HTTPS |
| `X-Frame-Options` | `DENY` | Block all framing (global) |
| `X-Content-Type-Options` | `nosniff` | Prevent MIME sniffing |
| `X-XSS-Protection` | `1; mode=block` | Legacy XSS filter |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Limit referrer leakage |
| `Permissions-Policy` | geolocation, microphone, camera, payment, usb, bluetooth all `()` | Block sensor/payment APIs |
| `Content-Security-Policy` | See below | Script/connect origin control |

**CSP (global routes):**
```
default-src 'none';
script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net;
connect-src 'self' https://ikgybeldlngntrpyzcnh.supabase.co wss://ikgybeldlngntrpyzcnh.supabase.co;
img-src 'self' data: https://placehold.co;
style-src 'self' 'unsafe-inline';
font-src 'self';
frame-src 'self';
frame-ancestors 'none';
base-uri 'self';
form-action 'self';
object-src 'none';
manifest-src 'self'
```

**CSP (`/gantt.html` override):**
```
default-src 'none';
script-src 'self' 'unsafe-inline';
style-src 'self' 'unsafe-inline';
img-src 'self' data: blob:;
font-src 'self';
frame-ancestors 'self';
base-uri 'self';
form-action 'none';
object-src 'none'
```
`gantt.html` is the only page allowed to be framed (by `dashboard.html`). Its `X-Frame-Options` is overridden to `SAMEORIGIN`.

### XSS protection

An `escapeHTML(str)` utility function is available and must be used for any user-controlled string interpolated into `innerHTML`. Project fields (`p.nome`, `p.cliente`, `p.azioneRichiesta`, supply scope fields) must be escaped at render time. This is the primary XSS defense given that `'unsafe-inline'` is present in the CSP.

**TODO:** Audit all `innerHTML` template literals in `dashboard.html` to confirm consistent `escapeHTML()` wrapping, especially before multi-user (team) mode ships. Intra-org XSS becomes a real attack vector once multiple users share an org.

**TODO:** Remove `'unsafe-inline'` from `script-src` by migrating all inline `<script>` blocks to external `.js` files and applying a nonce or hash-based CSP. This is a significant refactor and a prerequisite for a hardened enterprise tier.

### Anon key exposure

`SUPABASE_KEY` (the publishable anon key) is visible in HTML source. This is the intended Supabase pattern: the anon key grants no privileges beyond what RLS policies allow for unauthenticated users (which is nothing for this app). The `SUPABASE_SERVICE_ROLE_KEY` must never appear in client-side code; it is confined to Edge Functions as a Supabase-managed secret.

### Input validation

- **Client-side:** HTML `required` attributes on form inputs. Explicit checks for empty org name at registration. Stripe price ID validated against known values in Edge Functions.
- **Server-side:** PostgreSQL column constraints (`NOT NULL`, `UNIQUE`). RLS policies. Stripe webhook signature verification.
- **No server-side application validation** exists between the client and the database. RLS is the only server-enforced data boundary. Malformed JSONB payloads to `milestones`, `stepDurations`, or `supplyScope` columns are not rejected — they are stored as-is.

### CORS (Edge Functions)

All three Edge Functions return broad CORS headers (`Access-Control-Allow-Origin: *`). This is acceptable because authentication is enforced via the `Authorization: Bearer <JWT>` header on every call, not by origin. An attacker with the URL but no valid JWT cannot retrieve data or trigger billing actions.

---

## 9. Known Limitations and Tech Debt

Items are grouped by category and priority.

### High priority — correctness

**`milestones` / `stepDurations` length must match `WORKFLOW_STEPS`.**
Adding or removing workflow steps in Settings without migrating existing project arrays causes silent data misalignment: checked state misaligns with step names, progress percentage is wrong, critical path calculations silently use `parseInt(undefined) || 5` as a default duration. There is no migration helper. Any change to `workflow_steps` setting must be accompanied by a manual data migration.

**`toggleStep` does not roll back on DB write failure.**
The UI is updated optimistically before the Supabase write completes. If the write fails, the browser shows the new milestone state but the database retains the old state. On next page load the UI reverts with no user feedback.

**`saveSettingToCloud` uses `.update()` instead of `.upsert()`.**
If a settings key is introduced after an org was created and not pre-seeded, the update silently saves 0 rows. The setting appears saved but is not persisted. Should use `.upsert({ onConflict: 'key,org_id' })`.

**No input validation on project name before save.**
An empty project name passes through `saveProject()` and is written to the DB, producing nameless project cards.

### High priority — security

**XSS via unescaped user data in `innerHTML`.**
Project fields are interpolated into `innerHTML` template literals without consistent `escapeHTML()` wrapping. Mitigated currently by single-user orgs (attacker = victim). Becomes an exploitable intra-org XSS once team invitations ship.

**`invitations_token_lookup` RLS policy is fully public (`USING (true)`).**
Anyone can `SELECT` from `invitations` without authentication, exposing email addresses and invite tokens for all pending invitations. Intended for the join flow but overly broad.

**`org_members_self` policy covers ALL operations including DELETE.**
An authenticated user can delete their own `org_members` row, removing themselves from an org. They could also attempt to INSERT themselves into another org if they guess the sequential `org_id`. Should be split into separate SELECT/INSERT/UPDATE/DELETE policies with INSERT restricted to server-side functions.

### Medium priority — maintenance

**Supabase URL and anon key duplicated in `login.html` and `dashboard.html`.**
Any credential rotation requires editing two files. Extract to a shared `config.js` included by both pages, or introduce a build step with environment variable injection.

**`DEFAULT_SETTINGS` duplicated in `login.html` and `dashboard.html`.**
Two sources of truth for the org onboarding defaults. Drift is likely over time. Extract to a shared `defaults.js`.

**Mixed Italian/English column names in `projects` table.**
Legacy Italian columns (`nome`, `cliente`, `priorita`, `ritardoGiorni`, `statoQualita`, `rischiAlti`, `azioneRichiesta`) require a translation layer on every fetch. New columns are English. This naming split adds cognitive overhead and is a migration blocker for new developers. Low urgency but should be resolved before the team grows.

**`"Settings"` table name is PascalCase (quoted).**
All other tables are lowercase snake_case. Any query omitting quotes against this table will silently fail. Should be renamed to `settings` in a coordinated migration.

**Supabase JS library loaded at unpinned minor version.**
`https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2` resolves to the latest `2.x` release. A breaking change in a minor release could silently break the app on next page load. Pin to a specific version (e.g., `@2.47.0`) or add Subresource Integrity (SRI) hash.

### Medium priority — performance

**Full `renderProjects()` re-render on every state change.**
`container.innerHTML = ''` followed by rebuilding all cards fires on every toggle, save, delete, or fetch. With 50+ projects this causes visible flicker and layout thrashing. Consider fine-grained card updates or a virtual-DOM micro-library.

**`computeCriticalPath` called 2N times per refresh.**
`getHealth(p)` calls `computeCriticalPath(p)` both during `updateSummary()` and `renderProjects()`. Results should be cached and invalidated only on project mutation.

**`requestAnimationFrame + setTimeout(50ms)` scheduled per card.**
`renderProjects()` schedules one timer per rendered card for carousel centering. With 20+ projects, 20 timers fire simultaneously. Should be batched into a single post-render callback.

### Low priority — polish

**CSS variable inconsistencies.**
`--radius`, `--bg-secondary`, and `--text-primary` are referenced in some component styles but undefined (actual vars are `--radius-md`, `--bg-alt`, `--text`). Causes silent fallback to browser defaults, visible especially in dark mode.

**Inline `style=""` attributes throughout HTML.**
Recurring spacing and display overrides should be extracted to utility classes in `styles.css` for dark-mode compatibility and maintainability.

**Password reset drops users into `dashboard.html` without a password-change UI.**
The recovery token is consumed silently, the user is logged in, and they are never prompted to set a new password. A dedicated `reset-password.html` page now exists but must be wired as the `redirectTo` target in `db.auth.resetPasswordForEmail()`.

**No error observability.**
No Sentry, no Datadog, no server-side logging. Errors surface only via in-page toast/error UI. Production bugs are invisible until a user reports them.

**No automated tests.**
No test runner, no test files, no CI pipeline. All business logic (health scoring, critical path, ISO week arithmetic, working-day calculation) is untested. `computeCriticalPath()` and `getHealth()` are pure functions that could be extracted and unit-tested without a browser environment.

---

## Appendix: RBAC status

The `role` column in `org_members` (`'admin'` | `'member'`) is stored but not enforced in application logic or most RLS policies. The `invitations_admin` policy is the only place where `role = 'admin'` is checked. All other org members have equal read/write access to all org data. Full RBAC enforcement is required before the team/enterprise tier ships.

---

*Architecture document: 2026-03-19. Supersedes version dated 2026-03-05.*
