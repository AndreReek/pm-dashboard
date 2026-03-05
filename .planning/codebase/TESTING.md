# Testing Patterns

**Analysis Date:** 2026-03-05

## Test Framework
**Runner:** None
**Config:** None

No test runner, no test framework, no test configuration files of any kind are present in the repository. No `jest.config.*`, `vitest.config.*`, `playwright.config.*`, `cypress.config.*`, `.mocharc.*`, or equivalent files exist. No `package.json` exists, so there are no npm scripts for testing.

## Test Coverage
**Current state:** No automated tests detected. Zero test files exist matching `*.test.*` or `*.spec.*` patterns. There is no test directory. The entire codebase consists of four HTML files, one CSS file, and one SQL file — with all JavaScript as inline script blocks, which is a structural barrier to unit testing without refactoring.

## Manual Testing
**Approach:** The project relies entirely on manual, browser-based testing against the live Supabase backend. Observable manual testing patterns embedded in the code:

- `console.log` statements with `[INIT]` prefix in `dashboard.html` trace the full auth and org-provisioning flow, indicating active use of the browser console for runtime verification.
- `console.error` calls on every catch block surface DB errors during development.
- The app auto-creates a demo project on first login, providing a built-in functional smoke test for new account creation.
- Defensive fallbacks (hardcoded `TECHS`, `BRANDS`, `STATUSES` defaults in `loadSettings` catch block; retry without `stepDurations` in `saveProject`) were likely added after manual discovery of production failures.
- The `_headers` file (Vercel security headers) suggests deployment testing is done by pushing to Vercel and verifying live behavior.

## Recommendations
- Extract all JavaScript out of inline `<script>` blocks into standalone `.js` modules (ESM). This is the prerequisite for any unit testing — inline scripts cannot be imported by a test runner.
- Add a unit test suite (Vitest recommended for its zero-config ESM support) covering:
  - `isoWeek(date)` — pure function, critical for correct ISO week display
  - `addWorkingDays(date, n)` — pure function, edge cases around weekends
  - `computeCriticalPath(project)` — pure function, core business logic for health scoring and timeline estimation
  - `getHealth(project)` — pure function, drives the RAG status shown on every card
  - `getMetricColor(type, value, priority)` — pure function, simple but governs visual health signals
- Add end-to-end tests (Playwright recommended) covering the critical user flows:
  - Registration: create account → org provisioned → settings seeded → demo project created → dashboard renders
  - Login / logout round-trip
  - Create, edit, delete a project
  - Toggle a workflow step and verify milestone persistence
  - Open Step Timeline, change a step duration, verify ISO week recalculation
  - Settings: add and remove a technology tag
- Add a CI pipeline (GitHub Actions) that runs Vitest unit tests on every pull request to `main`, blocking merges on test failure. E2E tests can run on a schedule or pre-deploy.
- Introduce a `package.json` with a minimal dev dependency set (`vitest`, `@playwright/test`) to enable `npm test` as the standard test entry point.
- Consider adding a `CONTRIBUTING.md` or inline comment convention: any new pure utility function must ship with a corresponding unit test.

---
*Testing analysis: 2026-03-05*
