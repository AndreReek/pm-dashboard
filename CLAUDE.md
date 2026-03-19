# Fieldline — PM Dashboard SaaS

Project management tool focused on workflow tracking + supply scope management.
Multi-tenant SaaS with Stripe billing (Free / Pro $19 / Studio $49).

## Stack
- Frontend: Vanilla HTML5 + JS (no framework), CSS custom design system
- Auth + DB: Supabase (PostgreSQL + RLS + Edge Functions)
- Payments: Stripe (3 Edge Functions: create-checkout, stripe-webhook, billing-portal)
- Hosting: Vercel

## Key Files
- `dashboard.html` — core app (~106KB), all JS inline
- `login.html` — auth (signup, signin, password reset)
- `index.html` — public landing page + pricing
- `join.html` — team invite flow (token-based)
- `gantt.html` — critical path / timeline view (not yet linked to dashboard)
- `legal.html` — ToS + Privacy Policy
- `setup.sql` — Supabase schema
- `_headers` — Vercel/Netlify security headers + CSP
- `supabase/functions/` — Edge Functions (Deno runtime)

## Pricing / Plans
| Plan   | Price | Seats | Projects |
|--------|-------|-------|----------|
| Free   | $0    | 1     | 10 max   |
| Pro    | $19   | 5     | Unlimited|
| Studio | $49   | ∞     | Unlimited|

## Agent Map (use these for each task type)

| Task | Agent |
|------|-------|
| XSS / security hardening | `engineering-security-engineer` |
| Paywall / seat enforcement | `engineering-frontend-developer` |
| Supabase RLS / schema changes | `engineering-database-optimizer` |
| Vercel deploy / CI/CD / env vars | `engineering-devops-automator` |
| Architecture decisions | `engineering-software-architect` |
| Code review before merge | `engineering-code-reviewer` |
| SLO / error tracking / monitoring | `engineering-sre` |
| UI components / dark-light theme | `design-ui-designer` |
| UX flows / information arch | `design-ux-architect` |
| Test coverage / API testing | `testing-api-tester` |
| Pre-launch audit / QA | `testing-reality-checker` |
| Performance / load testing | `testing-performance-benchmarker` |
| Sprint planning / prioritization | `product-sprint-prioritizer` |
| Product decisions / roadmap | `product-manager` |

## Known Issues (Priority Order)
1. CRITICAL: Paywall not enforced — free users can create >10 projects
2. CRITICAL: Seat limit not enforced — Pro users can invite >5 members
3. CRITICAL: XSS via `innerHTML` on user-controlled data (no escapeHTML)
4. HIGH: Input validation missing (project names, settings fields)
5. HIGH: Email verification not enforced before dashboard access
6. HIGH: No live deployment (no domain, no CI/CD, no vercel.json)
7. HIGH: RLS policies don't enforce RBAC (admin vs member)
8. MEDIUM: Supabase URL/Key hardcoded in 2+ files (should be config.js)
9. MEDIUM: Zero automated tests
10. LOW: Italian/English mixed column names in DB

## Supabase Config
- URL: https://ikgybeldlngntrpyzcnh.supabase.co
- Anon key: sb_publishable_RodF4T3p7nW1AVdkAmm3Lg_78pL2uPv (public, safe to commit)

## Stripe Price IDs
- Pro: `price_1T7f8CFAY0SgGV6JuTDa4ZZl`
- Studio: `price_1T7f8RFAY0SgGV6JzfQSGvaP`
