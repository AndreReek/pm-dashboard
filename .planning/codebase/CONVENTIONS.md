# Coding Conventions

**Analysis Date:** 2026-03-05

## Naming Patterns
**Files:** kebab-case HTML files (`dashboard.html`, `login.html`, `index.html`, `legal.html`, `styles.css`, `setup.sql`). No JS or TS source files — all JS is inline `<script>` blocks.
**Functions:** camelCase verbs describing action (`handleLogin`, `fetchProjects`, `renderProjects`, `toggleStep`, `openAddModal`, `closeModal`, `saveProject`, `computeCriticalPath`, `updateStepDuration`, `addWorkingDays`). Handler functions prefixed with `handle` (`handleLogin`, `handleRegister`, `handleLogout`, `handleForgotPassword`). Render functions prefixed with `render` (`renderProjects`, `renderCriticalPath`, `renderSettingsUI`). Toggle functions prefixed with `toggle` (`toggleTheme`, `toggleSidebar`, `toggleStep`, `toggleCriticalPath`, `toggleCategory`).
**Variables:** camelCase for mutable state (`projects`, `editingId`, `currentOrgId`, `currentUser`, `currentOrgName`, `openTimelinePanels`). SCREAMING_SNAKE_CASE for configuration constants and settings arrays (`SUPABASE_URL`, `SUPABASE_KEY`, `DEFAULT_SETTINGS`, `SETTINGS_LABELS`, `STATUS_LABELS`, `TECHS`, `BRANDS`, `STATUSES`, `WORKFLOW_STEPS`, `CATEGORIE`, `PRIORITA`). Short descriptive names for DOM references (`el`, `btn`, `row`, `card`, `container`). Mixed Italian/English in DB column names and variable names reflecting the project's origin (`nome`, `cliente`, `priorita`, `ritardoGiorni`, `statoQualita`, `rischiAlti`, `azioneRichiesta`, `CATEGORIE`, `PRIORITA`).
**CSS Classes:** kebab-case component-scoped names (`project-card`, `sidebar-link`, `metric-card`, `supply-badge`, `toast-container`, `cp-panel`, `cp-step`, `lp-hero`, `lp-feature`). BEM-adjacent block-element pattern without strict BEM (`sidebar-brand`, `sidebar-nav`, `sidebar-footer`, `sidebar-user`). State modifier classes appended directly (`active`, `open`, `cp-open`, `cp-done`, `cp-active`, `cp-overdue`, `active-focus`). Prefix scoping for page-specific components: `lp-` for landing page, `cp-` for critical path / step timeline.
**HTML IDs:** camelCase matching the entity and field (`projectName`, `projectClient`, `loginEmail`, `loginPassword`, `toastContainer`, `userAvatar`, `userName`, `userOrg`, `settingsModal`, `settingsContainer`). Dynamic IDs use template literals with project ID suffix (`carousel-${p.id}`, `cp-${p.id}`, `step-${p.id}-${i}`).

## Code Style
**Formatting:** None detected. No `.prettierrc`, `.editorconfig`, or similar config file present.
**Linting:** None detected. No `.eslintrc`, `eslint.config.*`, or any linting configuration file present.

## JavaScript Patterns
**Module style:** Inline `<script>` blocks only. All JS lives at the bottom of each HTML file in a single monolithic script block. No ES modules, no `import`/`export`, no separate `.js` files. The Supabase client is loaded via CDN (`https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2`) and accessed as a global.
**Async patterns:** Exclusively `async/await` for all Supabase calls. IIFE pattern used in `login.html` for the session check on page load: `(async () => { ... })()`. In `dashboard.html`, the entry point is a named `async function init()` called at the bottom of the script. Every async DB operation destructures `{ data, error }` from the Supabase client response.
**DOM manipulation:** Direct `getElementById` and `querySelector`/`querySelectorAll` — no abstraction layer. HTML is generated primarily via template literals injected into `innerHTML`. Imperative style: `element.classList.add/remove/toggle`, `element.style.display`, `element.textContent`. Dynamic card rendering uses `document.createElement` + `appendChild` for the project cards outer loop, with inner content set via `innerHTML` template literals. Scroll behavior managed with `requestAnimationFrame(() => setTimeout(..., 50))` for carousel centering.

## Error Handling
**Patterns:**
- All async Supabase calls use `try/catch/finally`. The `finally` block always re-enables disabled buttons to prevent UI deadlock.
- Supabase responses are destructured as `{ data, error }`. Errors are thrown with `throw error` (or `throw authError`, `throw orgError`, etc.) to be caught by the surrounding `try/catch`.
- User-facing errors surface via the `toast(msg, 'error')` function in dashboard.html, or `showError(msg)` in login.html (a dedicated visible error box element).
- Graceful fallback strategy: `fetchProjects` renders an error state card on catch. `loadSettings` catches and falls back to hardcoded minimal defaults so the app stays functional without settings.
- Defensive column fallback in `saveProject`: if the DB returns an error mentioning `stepDurations`, the save is retried without that column — handling deployments missing the migration.
- `console.error` used alongside user-visible errors for debuggability. `console.log` used extensively in `init()` with `[INIT]` prefix for tracing auth and org provisioning.
- `confirm()` used for destructive actions (delete project, remove setting item) as a simple guard.

## Comments
**Style:** Section delimiter comments using `// ---- SECTION NAME ----` (all caps, dashes) to separate logical sections within the monolithic script (`// ---- CONFIG ----`, `// ---- STATE ----`, `// ---- AUTH GUARD + INIT ----`, `// ---- PROJECTS ----`, etc.). Inline comments on non-obvious logic (`// Computes a due date ~6 months from now`, `// persists open Step Timeline panels across re-renders`, `// Fallback defaults`, `// Italian (legacy) + English supply status classes`). Numbered step comments for multi-step async flows (`// 1. Sign up`, `// 2. Create organization`, `// 3. Link user to org`). CSS section headers use `/* ---- SECTION ---- */` pattern matching the JS style.

## CSS Conventions
**Approach:** Custom design system using CSS custom properties (variables). Not BEM, not a utility framework. Component-scoped custom classes with semantic naming. All design tokens defined in `:root` and overridden for dark mode via `[data-theme="dark"]` attribute selector. Page-specific styles use inline `<style>` blocks (landing page, login page) layered on top of the shared `styles.css`.
**Key patterns:**
- Design tokens: `--bg`, `--card`, `--text`, `--primary`, `--border`, `--radius-*`, `--shadow-*`, `--transition` — consumed consistently across components.
- Status color pairs always come as `--color` + `--color-bg` + `--color-text` triplets for semantic status styling (`--green`, `--green-bg`, `--green-text`).
- Supply status colors follow `--supply-{status}` + `--supply-{status}-text` pairs, with CSS classes `status-{status}` applied dynamically.
- Animations defined as named `@keyframes` (`fadeIn`, `slideUp`, `slideInRight`, `fadeOut`) and applied via `animation` shorthand including auto-remove timing.
- Responsive layout via two `@media` breakpoints: `max-width: 1024px` (tablet) and `max-width: 768px` (mobile). Mobile sidebar uses `transform: translateX(-100%)` with `.open` class toggle.
- `var(--transition)` (`0.2s ease`) applied uniformly for interactive element transitions.

---
*Convention analysis: 2026-03-05*
