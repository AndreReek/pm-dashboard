# Codebase Concerns

**Analysis Date:** 2026-03-05

---

## Tech Debt

**Hardcoded API credentials in client-side HTML:**
- Issue: `SUPABASE_URL` and `SUPABASE_KEY` (anon/publishable key) are duplicated verbatim in both `login.html` and `dashboard.html`. Any change to the project URL or key requires editing two files.
- Files: `login.html` (line 67–68), `dashboard.html` (line 175–176)
- Impact: Two sources of truth for config; easy to forget one file. Also signals that a build step or shared config module is needed as the app grows.
- Fix approach: Extract to a shared `config.js` file included via `<script>` tag, or move to a Vercel environment variable with a build-step injection step when a build pipeline is introduced.

**`DEFAULT_SETTINGS` duplicated across two files:**
- Issue: The default org settings array (tecnologie, brand, stati_fornitura, workflow_steps, categorie, priorita) is copy-pasted into both `login.html` and `dashboard.html`.
- Files: `login.html` (lines 78–85), `dashboard.html` (lines 254–261)
- Impact: Any change to onboarding defaults must be applied in two places. Drift between the two definitions is likely over time.
- Fix approach: Extract to a shared `defaults.js` that both pages include.

**Mixed Italian/English field names in the database schema:**
- Issue: The `projects` table uses Italian column names (`nome`, `cliente`, `priorita`, `ritardoGiorni`, `statoQualita`, `rischiAlti`, `azioneRichiesta`) alongside English ones (`mainStatus`, `category`, `dueDate`, `supplyScope`, `milestones`, `stepDurations`). The application applies a translation layer (`italianQuality`, `italianPriority`, `italianStatus`) on every data fetch.
- Files: `setup.sql` (lines 32–48), `dashboard.html` (lines 364–371)
- Impact: The translation layer adds cognitive overhead; new developers must understand two naming conventions; bugs can occur if values are stored in one language and expected in another.
- Fix approach: Migrate columns to English in a coordinated DB migration + code update. Low urgency but should be done before the team grows.

**`Settings` table name is PascalCase (capitalized), all others are lowercase:**
- Issue: The table is named `"Settings"` (quoted in SQL), which requires quoting in all queries and deviates from standard Supabase/PostgreSQL snake_case convention.
- Files: `setup.sql` (line 22), `dashboard.html` (lines 331, 299, 192–194), `login.html` (line 192)
- Impact: Requires consistent quoting. Any query that omits quotes will silently fail or hit a different table. Unusual for Supabase projects and breaks convention.
- Fix approach: Rename to `settings` (lowercase) in a migration and update all references.

**Inline styles throughout HTML:**
- Issue: Layout, spacing, and display overrides are applied via `style=""` attributes throughout `dashboard.html`, `login.html`, and `index.html` rather than CSS classes.
- Files: `dashboard.html` (multiple elements), `index.html` (multiple elements)
- Impact: Hard to maintain consistent spacing system; no way to apply theme-aware dark mode overrides to inline styles; violates DRY.
- Fix approach: Systematically extract recurring inline style patterns into utility classes in `styles.css`.

**CSS variables inconsistency (`--radius` vs `--radius-md`, `--bg-secondary` vs `--bg-alt`, `--text-primary` vs `--text`):**
- Issue: The stylesheet defines `--radius-sm`, `--radius-md`, `--radius-lg`, `--radius-xl`, but some component CSS references `--radius` (undefined) and `--bg-secondary` (undefined, actual var is `--bg-alt`), and `--text-primary` (undefined, actual is `--text`).
- Files: `styles.css` (lines 899, 948, 949)
- Impact: Silent fallback to browser defaults (usually 0px radius, black text, white background) in those components, causing visual inconsistency, especially in dark mode.
- Fix approach: Audit all CSS variable references; either add aliases or standardize on one naming convention.

**`saveSettingToCloud` uses `update()` not `upsert()`:**
- Issue: When saving settings, the code calls `.update()` filtered by `key` and `org_id`. If a settings row does not exist, the update silently succeeds with 0 rows affected — no row is created.
- Files: `dashboard.html` (line 808)
- Impact: If a new settings key is introduced and not pre-seeded, the save operation appears to succeed but the data is never persisted.
- Fix approach: Switch to `.upsert()` with `onConflict: 'key,org_id'` consistent with the database `UNIQUE(org_id, key)` constraint.

**`toggleStep` does not roll back on failure:**
- Issue: `toggleStep` optimistically updates the local `p.milestones` array and re-renders before the Supabase write completes. If the write fails, the UI shows the new state but the database retains the old state.
- Files: `dashboard.html` (lines 501–508)
- Impact: Silent data inconsistency. User believes a step is checked; on next reload it reverts.
- Fix approach: Store the old value before mutating, roll back on error, and toast the user.

**No input validation on project name before save:**
- Issue: `saveProject()` collects `projectName.value` and sends it directly without checking that it is non-empty.
- Files: `dashboard.html` (lines 445–498)
- Impact: A blank project name can be saved to the database, resulting in nameless project cards.
- Fix approach: Add a guard: `if (!data.nome.trim()) { toast('Project name is required', 'error'); return; }`.

---

## Security Considerations

**Anon key exposed in client-side source:**
- Risk: `SUPABASE_KEY` (the publishable/anon key) is visible in the HTML source of both `login.html` and `dashboard.html`. Anyone can view it via browser DevTools or `view-source:`.
- Files: `login.html` (line 68), `dashboard.html` (line 176)
- Current mitigation: This is the intended pattern for Supabase anon keys — it is designed to be public. RLS policies enforce that unauthenticated users cannot access data. The anon key alone cannot bypass RLS.
- Recommendations: Confirm that no Supabase service-role key ever appears in client code. Periodically rotate the anon key if an employee leaves or a key is compromised. Add a comment in the code noting this is intentional.

**CSP uses `unsafe-inline` for both `script-src` and `style-src`:**
- Risk: The Content Security Policy in `_headers` allows `'unsafe-inline'` for scripts and styles, which weakens XSS protection. Inline scripts and styles cannot be blocked by the browser even if injected by an attacker.
- Files: `_headers` (line 7)
- Current mitigation: The app does not accept user-generated HTML/markdown content that would be rendered as markup. XSS vectors are limited.
- Recommendations: Before user-generated content or richer text fields are introduced, migrate inline scripts to external `.js` files and replace `unsafe-inline` with a nonce-based or hash-based CSP. This is a prerequisite for a paid/enterprise tier.

**XSS via unescaped project data in `innerHTML`:**
- Risk: Project fields (`p.nome`, `p.azioneRichiesta`, `p.cliente`, supply scope fields) are interpolated directly into `innerHTML` strings in `renderProjects()` and related functions. A project name containing `<script>alert(1)</script>` would execute.
- Files: `dashboard.html` (lines 670–712, 697–702)
- Current mitigation: Only authenticated users within the same org can create projects. The attacker would need to be a member of the same organization. This is a trust-within-org model.
- Recommendations: As team invitations are added (multiple users per org), this becomes a real intra-org XSS vector. Before multi-user shipping: sanitize all interpolated strings with a `escapeHTML()` helper or switch card rendering to `createElement` + `textContent` pattern.

**Registration flow: org creation without server-side validation:**
- Risk: The registration in `login.html` creates an organization and org_members row from client-side code after `signUp()`. If `signUp()` succeeds but the org insert fails (e.g., RLS issue, network drop), the user ends up authenticated with no org. The dashboard then auto-provisions a fallback org using the email domain as org name — unintended behavior.
- Files: `login.html` (lines 162–196), `dashboard.html` (lines 285–303)
- Current mitigation: The dashboard has an orphan-user auto-provisioning guard that catches this case.
- Recommendations: Move the org + member creation to a Supabase Edge Function triggered post-signup, so it runs server-side and can be retried atomically. This also removes org creation logic from client code.

**No rate limiting on the forgot-password form:**
- Risk: The forgot-password flow calls `db.auth.resetPasswordForEmail()` with no UI throttle. An attacker can submit arbitrary emails in rapid succession.
- Files: `login.html` (lines 113–126)
- Current mitigation: Supabase applies server-side rate limiting on auth endpoints.
- Recommendations: Add a client-side cooldown (disable button for 60 seconds after submit) to reduce accidental spam and improve UX.

**Password reset redirects to `dashboard.html` directly:**
- Risk: `resetPasswordForEmail` uses `redirectTo: window.location.origin + '/dashboard.html'`. The dashboard auth guard (`init()`) calls `getSession()` which, on a recovery token URL, will exchange the token and establish a session — this works, but `dashboard.html` has no dedicated password-update UI. The user is dropped into the app without being asked to set a new password.
- Files: `login.html` (lines 118–119)
- Current mitigation: Supabase handles the token exchange transparently; user is logged in. But the user never explicitly sets a new password through a form.
- Recommendations: Add a dedicated `reset-password.html` page or detect the `type=recovery` hash param in the URL and show a password-change modal before entering the dashboard.

---

## Performance Bottlenecks

**Full re-render of all project cards on every state change:**
- Problem: `renderProjects()` sets `container.innerHTML = ''` and rebuilds the entire DOM from scratch on every toggle, save, delete, or fetch. With 50+ projects this causes visible flicker and layout thrashing.
- Files: `dashboard.html` (lines 634–728)
- Improvement path: Implement fine-grained updates: update only the affected card's health dot, milestone checkboxes, and progress bar instead of full re-render. Or adopt a virtual-DOM micro-library if card count grows.

**`computeCriticalPath` called multiple times per render cycle:**
- Problem: `getHealth(p)` calls `computeCriticalPath(p)` for every project during `updateSummary()` and again during `renderProjects()`. For N projects, critical path is computed 2N times per refresh.
- Files: `dashboard.html` (lines 525–551, 554–575, 412–426)
- Improvement path: Cache critical path results keyed by project ID and step durations/milestones hash; invalidate only on mutations.

**Google Fonts loaded from external CDN without `font-display: swap`:**
- Problem: `styles.css` imports Inter from `fonts.googleapis.com` at the top of the stylesheet. If the CDN is slow or unavailable, text rendering blocks.
- Files: `styles.css` (line 4)
- Improvement path: Add `&display=swap` to the Google Fonts URL. Consider self-hosting Inter for zero external font dependency.

**Supabase JS library loaded from jsDelivr CDN (unpinned minor version):**
- Problem: `<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2">` loads the latest `@2.x.x` release. A breaking change in a minor version could silently break the app on next page load.
- Files: `dashboard.html` (line 9), `login.html` (line 9)
- Improvement path: Pin to a specific version (e.g., `@supabase/supabase-js@2.47.0`) or use Subresource Integrity (SRI) hash to guard against CDN compromise.

**`requestAnimationFrame + setTimeout(50ms)` scroll for each card:**
- Problem: `renderProjects()` schedules a `requestAnimationFrame(() => setTimeout(() => centerActiveStep(...), 50))` for every project card rendered. With 20 projects, 20 timers fire simultaneously.
- Files: `dashboard.html` (line 724)
- Improvement path: Use a single `requestAnimationFrame` after the render loop completes, batching all carousel scroll operations.

---

## Fragile Areas

**`milestones` array length must equal `WORKFLOW_STEPS` length:**
- Files: `dashboard.html` (lines 501–508, 556–558, 661–664)
- Why fragile: If a user adds or removes workflow steps in Settings, existing projects have `milestones` arrays of different length than `WORKFLOW_STEPS`. The mismatch causes: (a) `findIndex` returning wrong results, (b) checked states visually misaligned with step names, (c) progress percentage incorrect.
- Safe modification: Before any Settings change to `workflow_steps`, migrate all existing project `milestones` arrays to match the new length. Add a migration helper function that pads or truncates `milestones` on settings save.

**`stepDurations` array length must equal `WORKFLOW_STEPS` length:**
- Files: `dashboard.html` (lines 557–558, 623–631)
- Why fragile: Same issue as `milestones`. `updateStepDuration` pads the array to `WORKFLOW_STEPS.length` dynamically, but `computeCriticalPath` uses `durations[i]` with no bounds check, defaulting to `parseInt(undefined) || 5`. Silent bugs when lengths differ.
- Safe modification: Same migration approach as milestones; validate lengths after settings changes.

**Supply status CSS class mapping relies on string transformation:**
- Files: `dashboard.html` (line 700), `styles.css` (lines 466–472)
- Why fragile: The supply badge class is computed as `status-${s.status.toLowerCase().replace(/ /g, '_')}`. If a user defines a status value in Settings that contains special characters or accented letters, the CSS class will not match any defined rule and the badge will render unstyled.
- Safe modification: Validate/sanitize status values in `addSettingItem` to only allow alphanumeric + spaces. Or build an explicit mapping dictionary.

**`openTimelinePanels` Set uses integer project IDs from Supabase (BIGINT):**
- Files: `dashboard.html` (lines 185, 615, 616, 615)
- Why fragile: Supabase returns BIGINT values as JavaScript numbers. For very large org deployments, BIGINT values can exceed `Number.MAX_SAFE_INTEGER` (2^53 - 1), causing ID collisions. Currently not a practical risk but sets a ceiling.
- Safe modification: If IDs ever become large, store them as strings in the Set and compare as strings.

**`org_members_self` RLS policy only uses `user_id = auth.uid()`:**
- Files: `setup.sql` (line 57)
- Why fragile: The `org_members` policy allows any authenticated user to `SELECT` their own row, but also allows `INSERT`, `UPDATE`, and `DELETE` on rows where `user_id = auth.uid()`. A malicious authenticated user could `DELETE` their own org_members row (removing themselves), or could attempt to `INSERT` themselves into another org if `org_id` is guessable (BIGINT sequential).
- Safe modification: Split into separate `SELECT`, `INSERT`, `UPDATE`, `DELETE` policies. Restrict `INSERT` to a server-side function. Restrict `DELETE` to admin role.

**Auto-provisioning fallback uses email domain as org name:**
- Files: `dashboard.html` (lines 286–303)
- Why fragile: If the email has no `@` (theoretically impossible with Supabase auth but edge-case-safe), `split('@')[1]` returns `undefined`, and the org is created with `name: undefined`. The Supabase `organizations.name` column is `NOT NULL`, so this would fail silently or throw.
- Safe modification: Add a fallback: `const orgName = currentUser.email.split('@')[1] || 'My Organization';` (this is present in some code paths but not all).

---

## Missing Critical Features

**No RBAC enforcement:**
- Problem: All authenticated org members have full read/write access to all org data. The `role` column in `org_members` (`admin` / `member`) is stored but never checked in application logic or RLS policies.
- Blocks: Enterprise/team tier where read-only members, project managers, and admins need different permissions. Also blocks safe team invitation (any invited user can delete all projects).

**No team invitation system:**
- Problem: There is no way to add a second user to an existing organization. Registration always creates a new org. Multi-user support requires an invitation flow (email invite link, token validation, org join without org creation).
- Blocks: Scenario B (Paid Beta). Any collaborative use case.

**No audit log / change history:**
- Problem: No record of who changed a project, when, or what value changed. All mutations overwrite data silently.
- Blocks: Compliance requirements, debugging production issues, multi-user conflict resolution.

**No project archiving (soft delete):**
- Problem: Deleting a project is permanent (`db.from('projects').delete()`). There is no archive/restore flow. A `closed` status exists but is not a soft-delete equivalent.
- Blocks: Accidental deletion recovery. Reporting on historical projects.

**No Stripe billing integration:**
- Problem: The app is free with no payment gate. Required for Scenario B.
- Blocks: Monetization. Currently any number of users and projects can be created for free.

**Password reset does not present a password-change UI:**
- Problem: The `redirectTo` for password reset points at `dashboard.html`. Users who click a reset link are logged in immediately without being prompted to choose a new password.
- Blocks: Proper password reset UX. Users clicking "forgot password" may not understand what happened.

**No email verification enforcement:**
- Problem: Registration calls `db.auth.signUp()` and checks `if (!authData.session)` to detect email-confirmation-required state — but if Supabase auth is configured with email confirmation disabled (common in development), users can register with any email address they type, including ones they don't own.
- Blocks: Data integrity for paid accounts. Email-based communication.

---

## Test Coverage Gaps

**No automated tests of any kind:**
- What's not tested: All business logic (health scoring, critical path calculation, ISO week calculation, working-day arithmetic, milestone toggle rollback, settings upsert, auth guard redirect), all UI interactions, all Supabase queries.
- Files: All files — there is no test directory, no test runner config, no test files.
- Risk: Any refactor or addition can silently break existing behavior. No regression safety net.
- Priority: High

**`isoWeek()` and `addWorkingDays()` are pure functions with no tests:**
- What's not tested: Edge cases: year boundary (Dec 28–Jan 3), start of week on Sunday/Saturday, leap years, `days=0`, very large day counts.
- Files: `dashboard.html` (lines 207–227)
- Risk: Incorrect ISO week numbers or working-day calculations produce wrong timeline estimates and wrong health scores, which are the core value proposition of the app.
- Priority: High

**`computeCriticalPath()` has no tests:**
- What's not tested: Projects with all steps done, projects with no steps done, projects with `stepDurations` shorter/longer than `WORKFLOW_STEPS`, projects with `dueDate` in the past, projects with `dueDate` in the far future.
- Files: `dashboard.html` (lines 554–575)
- Risk: Silent health-score calculation errors.
- Priority: High

**`getHealth()` health classification has no tests:**
- What's not tested: The 10-day boundary for critical vs attention, the fallback branch (no due date), the all-done completion branch.
- Files: `dashboard.html` (lines 525–551)
- Risk: Projects classified as "On Track" when they should be "Critical" (or vice versa) with no automated detection.
- Priority: High

**Registration and login flows have no integration tests:**
- What's not tested: Duplicate email registration, wrong password, org creation failure mid-flow, settings seeding failure, orphan user auto-provision path.
- Files: `login.html`
- Risk: Regressions in the onboarding funnel go undetected until a real user hits them.
- Priority: Medium

**Settings mutation (add/remove) has no tests:**
- What's not tested: Removing the last item from a settings list, adding a duplicate item, adding an item with special characters, `saveSettingToCloud` failing.
- Files: `dashboard.html` (lines 812–835)
- Risk: Settings corruption causing blank dropdowns in the project form.
- Priority: Medium

---

*Concerns audit: 2026-03-05*
