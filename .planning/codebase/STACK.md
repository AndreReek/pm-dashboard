# Technology Stack

**Analysis Date:** 2026-03-05

## Languages
**Primary:**
- HTML5 - Application structure (index.html, login.html, dashboard.html, legal.html)
- CSS3 - Styling and theming (styles.css, inline styles per page)
- JavaScript (ES2020+) - All application logic, async/await, inline `<script>` blocks

**Database / Schema:**
- SQL (PostgreSQL dialect) - Schema definition and RLS policies (setup.sql)

## Runtime
**Environment:**
- Browser-only — no Node.js, no server-side runtime
- All JS executes in the end-user's browser via `<script>` tags
**Package Manager:**
- None — no package.json, no lockfile
- Dependencies loaded via CDN at runtime (jsDelivr)

## Frameworks
**Core:**
- None — vanilla HTML/CSS/JS, zero build toolchain

**CSS Architecture:**
- Custom CSS variables (`:root` design tokens) for colors, spacing, radius
- `data-theme` attribute on `<html>` for dark/light mode switching
- Responsive layout via CSS Grid and Flexbox

## Key Dependencies
**Critical:**
- `@supabase/supabase-js@2` — only external JS dependency; loaded from `https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2`; provides all database, auth, and realtime client functionality

## Configuration
**Environment:**
- No `.env` files committed (`.gitignore` excludes `*.env` and `.env.*`)
- Supabase URL and publishable anon key are hardcoded as JS constants in `login.html` and `dashboard.html` (these are safe to expose as they are publishable keys governed by RLS)
- Theme preference stored in `localStorage` key `pm-theme`

**Build:**
- No build step — no webpack, vite, rollup, esbuild, or any bundler
- No `tsconfig.json`, `.nvmrc`, or any compile-time config files

**Security Headers:**
- `_headers` file defines Vercel/CDN-level HTTP security headers:
  - `Content-Security-Policy` — restricts scripts to self + jsDelivr CDN; connects only to Supabase origin
  - `X-Frame-Options: DENY`
  - `Strict-Transport-Security`
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Permissions-Policy` — geolocation/mic/camera blocked

## Platform Requirements
**Development:**
- Any text editor — no compiler, transpiler, or local dev server required
- A browser with ES2020+ support
- Supabase project credentials for the backend

**Production:**
- Static file host (currently Vercel, auto-deployed from GitHub `main`)
- Supabase project (EU region) for all data persistence and auth

---
*Stack analysis: 2026-03-05*
