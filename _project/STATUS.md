# Fieldline — Project Status Document

**Ultima modifica:** 19 marzo 2026
**Senior PM:** Fieldline Studio Producer
**Documento:** Riferimento operativo aggiornabile per ogni sessione futura

---

## 1. Snapshot del Prodotto

Fieldline e un SaaS di project management multi-tenant pensato per team che gestiscono workflow tracciati e supply scope. Ogni organizzazione opera in isolamento completo (RLS), con piani a tier che limitano seats e progetti. Il prodotto e live su Vercel, usa Supabase come backend, e Stripe per la monetizzazione.

| Voce | Dettaglio |
|---|---|
| URL live | Vercel deployment da branch `main` (dominio custom non ancora configurato) |
| Repo GitHub | Collegato a Vercel per auto-deploy su push a `main` |
| Stack sintetico | Vanilla HTML5/CSS/JS — Supabase (PostgreSQL + RLS + Edge Functions) — Stripe — Vercel |
| Runtime | Browser-only, zero build step, zero bundler, zero framework |

### Piano Prezzi

| Piano | Prezzo | Seats | Progetti | Note |
|---|---|---|---|---|
| Free | €0 | 1 | Max 10 | Nessuna carta richiesta |
| Pro | €19/mese | Max 5 | Illimitati | Price ID Stripe sandbox attivo |
| Studio | €49/mese | Illimitati | Illimitati | Price ID Stripe sandbox attivo |

> Nota: I prezzi in CLAUDE.md sono in USD ($19/$49). La valuta e stata allineata a EUR. I Price ID Stripe sono in modalita sandbox e non ancora in produzione live.

---

## 2. Stato Attuale (19 marzo 2026)

### Cosa e live e funzionante

- [x] Landing page pubblica (`index.html`) con pricing e CTA
- [x] Auth completo: signup, signin, password reset (`login.html`)
- [x] Dashboard protetta (`dashboard.html`) con auth guard
- [x] Multi-tenancy: ogni org e isolata via RLS PostgreSQL
- [x] Gestione progetti: create, edit, delete, filtri, ricerca
- [x] Health scoring automatico (On Track / Attention / Critical)
- [x] Critical path computation per timeline
- [x] Workflow steps con milestone toggle e progress tracking
- [x] Supply scope management per progetto
- [x] Settings org-level configurabili (tecnologie, brand, stati, workflow, categorie, priorita)
- [x] Dark / Light mode con `localStorage` persistence
- [x] Team invite flow token-based (`join.html`)
- [x] Gantt / timeline view (`gantt.html`) — presente ma non ancora collegato alla dashboard
- [x] Legal page (ToS + Privacy Policy) — `legal.html`

### Completato di recente (sprint precedenti)

| Area | Cosa e stato fatto |
|---|---|
| Security hardening | XSS mitigato via `escapeHTML()`, CSP configurata in `_headers`, `X-Frame-Options: DENY`, HSTS, `nosniff` |
| Paywall | Limitazione progetti (max 10 Free) e seats (max 5 Pro) enforced lato frontend |
| RLS | Politiche Row Level Security attive su tutte le tabelle; org isolation via `org_members WHERE user_id = auth.uid()` |
| Deploy config | Auto-deploy da GitHub `main` su Vercel operativo |
| Analytics | PostHog integrato (placeholder key — da sostituire con chiave reale) |
| Stripe billing | 3 Edge Functions Deno deployate: `create-checkout`, `stripe-webhook`, `billing-portal`; Price ID sandbox configurati |
| Stripe webhook | Gestione eventi `checkout.session.completed` e `customer.subscription.*` |

### Infrastruttura operativa

| Servizio | Stato | Note |
|---|---|---|
| Vercel | Operativo | Auto-deploy da GitHub `main`; nessun dominio custom ancora |
| Supabase | Operativo | EU region; URL: `ikgybeldlngntrpyzcnh.supabase.co` |
| Stripe | Sandbox attivo | Non ancora in modalita live/produzione |
| GitHub | Operativo | Branch `main` = produzione |
| PostHog | Integrato | API key placeholder — non raccoglie dati reali |

---

## 3. Problemi Aperti / Tech Debt

### Priorita Critica

| # | Problema | File | Impatto |
|---|---|---|---|
| C-1 | `unsafe-inline` ancora presente in CSP per `script-src` e `style-src` | `_headers` | Debolezza XSS strutturale; prerequisito per tier enterprise |
| C-2 | RBAC admin/member non enforced — ruolo `role` in `org_members` salvato ma mai controllato in logica app o RLS | `dashboard.html`, `setup.sql` | Qualsiasi membro invitato puo eliminare tutti i progetti |
| C-3 | Stripe in sandbox — nessun pagamento reale accettato | Edge Functions | Nessuna revenue finche non si switcha a live |

### Priorita Alta

| # | Problema | File | Impatto |
|---|---|---|---|
| H-1 | PostHog API key e un placeholder — nessun dato di analytics raccolto | `dashboard.html` | Analytics cieca, impossibile misurare retention e funnel |
| H-2 | Zero test automatici (unit, integration, e2e) | Tutti i file | Qualsiasi refactor puo rompere silenziosamente health scoring, critical path, auth flow |
| H-3 | `saveSettingToCloud` usa `.update()` invece di `.upsert()` — nuove chiavi settings mai persistite | `dashboard.html` L.808 | Corruzione silente delle settings su nuovi key |
| H-4 | `toggleStep` aggiorna UI ottimisticamente senza rollback su errore Supabase | `dashboard.html` L.501-508 | Inconsistenza silente UI vs DB su errore di rete |
| H-5 | Validazione input assente su nome progetto in `saveProject()` | `dashboard.html` L.445-498 | Progetti senza nome salvati in DB |
| H-6 | Supabase JS caricato da jsDelivr senza version pin ne SRI hash | `dashboard.html`, `login.html` L.9 | Breaking change in minor version puo rompere l'app silenziosamente |

### Priorita Media

| # | Problema | File | Impatto |
|---|---|---|---|
| M-1 | `SUPABASE_URL` e `SUPABASE_KEY` hardcoded in 2 file separati — nessun `config.js` condiviso | `login.html` L.67-68, `dashboard.html` L.175-176 | Ogni modifica credenziali richiede edit su 2 file |
| M-2 | `DEFAULT_SETTINGS` duplicato in `login.html` e `dashboard.html` | Entrambi i file | Drift probabile nel tempo — onboarding defaults possono divergere |
| M-3 | Colonne DB miste italiano/inglese nella tabella `projects` | `setup.sql` L.32-48 | Translation layer cognitivo; rischio bug; ostacola onboarding nuovi dev |
| M-4 | Tabella `"Settings"` in PascalCase con quoting obbligatorio — devia da snake_case Supabase | `setup.sql` L.22 | Query senza quote falliscono silenziosamente |
| M-5 | `milestones` e `stepDurations` devono essere array della stessa lunghezza di `WORKFLOW_STEPS` — nessuna migration guard | `dashboard.html` L.501-508, 557-558 | Se utente modifica workflow steps in Settings, tutti i progetti esistenti si rompono |
| M-6 | Full re-render di tutte le card su ogni state change (`container.innerHTML = ''`) | `dashboard.html` L.634-728 | Flicker visibile e layout thrashing con 50+ progetti |
| M-7 | Valuta EUR allineata ma prezzi Stripe price ID rimangono in sandbox | Stripe config | I prezzi live non sono ancora stati creati |
| M-8 | `isoWeek()` e `addWorkingDays()` sono funzioni pure senza test | `dashboard.html` L.207-227 | Calcoli errati producono health score e timeline errati — core value proposition |

### Priorita Bassa

| # | Problema | File | Impatto |
|---|---|---|---|
| L-1 | Inline styles su `style=""` in tutto l'HTML invece di classi CSS | Tutti i file HTML | Dark mode override impossibile su inline styles; violazione DRY |
| L-2 | CSS variable inconsistency (`--radius` vs `--radius-md`, `--bg-secondary` vs `--bg-alt`) | `styles.css` L.899, 948-949 | Silent fallback a browser defaults — visual glitch in dark mode |
| L-3 | Google Fonts senza `font-display: swap` | `styles.css` L.4 | Block rendering su CDN lenta |
| L-4 | `computeCriticalPath` chiamata 2N volte per render cycle (in `updateSummary` e `renderProjects`) | `dashboard.html` L.525-575 | Performance degradata con N progetti elevato |
| L-5 | `openTimelinePanels` Set usa integer BIGINT — ceiling teorico a `Number.MAX_SAFE_INTEGER` | `dashboard.html` L.185 | Non critico ora, ma imposta un ceiling |
| L-6 | Password reset redirect a `dashboard.html` senza UI per inserire nuova password | `login.html` L.118-119 | UX confusa per chi clicca "forgot password" |
| L-7 | No rate limiting UI sul form forgot-password | `login.html` L.113-126 | Spam accidentale (Supabase ha rate limit server-side, ma UX non lo segnala) |
| L-8 | `gantt.html` non ancora collegato alla dashboard nav | `dashboard.html` | Feature esiste ma non e accessibile dagli utenti |

---

## 4. Roadmap

### Fase 3 — In corso (Sprint attuale)

- [ ] **Trial period 14 giorni** — aggiungere colonna `trial_ends_at` in `organizations`, logica frontend che mostra banner di scadenza e blocca accesso dopo trial
- [ ] **Annual pricing toggle** — creare nuovi Price ID Stripe per billing annuale (Pro annual / Studio annual) + UI toggle mensile/annuale su `index.html`
- [ ] **PostHog key reale** — l'utente deve creare account PostHog, ottenere API key progetto e sostituire il placeholder in `dashboard.html`

### Fase 4 — Prossima (dopo Fase 3)

- [ ] **Stripe sandbox → live** — switch account Stripe da test a produzione, creare nuovi Price ID live in EUR, aggiornare env vars in Vercel e Supabase Edge Functions
- [ ] **Dominio custom su Vercel** — configurare dominio (es. `app.fieldline.io`) con DNS e certificato SSL automatico Vercel
- [ ] **Spostare JS inline in `dashboard.js` esterno** — prerequisito per rimuovere `unsafe-inline` dalla CSP; riduce `dashboard.html` da ~106KB e rafforza security posture
- [ ] **Test automatici** — unit test su `isoWeek()`, `addWorkingDays()`, `computeCriticalPath()`, `getHealth()`; integration test su auth flow e org provisioning (Playwright o Vitest)
- [ ] **RBAC completo** — enforzare `role = admin/member` sia in logica app che in RLS policies separate per SELECT/INSERT/UPDATE/DELETE su `org_members`
- [ ] **Email transazionali** — integrare Resend per welcome email, invite email, trial expiry reminder
- [ ] **Audit log tabella** — nuova tabella `audit_logs` con `org_id`, `user_id`, `action`, `target_id`, `timestamp`; RLS read-only per membri

### Fase 5 — Crescita (backlog strategico)

- [ ] **SSO Google/Microsoft** — Supabase OAuth provider configuration + UI pulsanti social login
- [ ] **API pubblica** — endpoint REST documentati per integrazioni terze parti; autenticazione via API key per org
- [ ] **Custom branding per org** — logo, colori primari e nome dominio per tier Studio/Enterprise
- [ ] **Metered billing per overages** — billing usage-based Stripe per seats extra oltre i limiti di piano
- [ ] **Archivio progetti (soft delete)** — colonna `archived_at` + filtro "archivio" in dashboard; ripristino progetto
- [ ] **Password reset dedicata** — pagina `reset-password.html` o modal con detect `type=recovery` nel hash URL prima di entrare in dashboard
- [ ] **Migrazione colonne DB in inglese** — `nome → name`, `cliente → client`, `priorita → priority`, ecc. in `projects` table (migration coordinata DB + code)
- [ ] **`config.js` condiviso** — estrarre `SUPABASE_URL` e `SUPABASE_KEY` da `login.html` e `dashboard.html` in un singolo file incluso via `<script>`

---

## 5. Metriche Target (KPI)

### Finanziario

| Metrica | Target | Note |
|---|---|---|
| MRR Pro | €1.900 | 100 team sul piano Pro a €19/mese |
| MRR Studio | €2.450 | 50 team sul piano Studio a €49/mese |
| MRR Combinato | €4.350 | Mix realistico dei due piani |
| Conversion Free → Pro | 5% | Su base utenti Free attivi |
| Churn mensile | <5% | Tasso di abbandono mensile |

### Prodotto e Operativo

| Metrica | Target | Note |
|---|---|---|
| Uptime | 99.9% | Vercel + Supabase SLA |
| Tempo risposta dashboard | <500ms | P95 su rete standard |
| Delivery sprint | 95% on-time | Task completati entro sprint pianificato |
| Bug critici in produzione | 0 | Zero incidenti P0 al mese |
| Test coverage (dopo Fase 4) | >70% | Su logica business core |

---

## 6. Decisioni Prese

Queste decisioni sono architetturalmente o strategicamente consolidate. Non vanno riconsiderate senza motivo esplicito.

| # | Decisione | Rationale | Data |
|---|---|---|---|
| D-01 | **Freemium model** (Free / Pro / Studio) | Abbassa barriera adozione, monetizza team maturi; Free come lead gen | Pre-launch |
| D-02 | **Vanilla HTML/CSS/JS — zero framework** | Zero toolchain overhead, deploy immediato come file statici, nessuna dipendenza da NPM ecosystem | Pre-launch |
| D-03 | **Supabase come backend unico** | Auth, database PostgreSQL, RLS, Edge Functions, realtime in un solo servizio managed | Pre-launch |
| D-04 | **Vercel per hosting** | Deploy automatico da GitHub `main`, CDN globale, zero config per static files, `_headers` nativo | Pre-launch |
| D-05 | **Stripe per billing** — Edge Functions Deno | Industry standard per SaaS billing; webhook server-side per sicurezza; Edge Functions Supabase per evitare server separato | Pre-launch |
| D-06 | **Multi-tenancy via RLS PostgreSQL** | Isolamento dati garantito a livello DB, non solo applicativo; ogni org non puo vedere dati altrui anche con bug frontend | Pre-launch |
| D-07 | **Supabase anon key in client-side** — accettato | E il pattern intenzionale di Supabase; la key e publishable e la sicurezza e delegata interamente alle RLS policies | Pre-launch |
| D-08 | **No build step, no bundler** | Coerente con scelta vanilla; aggiunge build toolchain solo quando il beneficio supera il costo (possibilmente mai per questo prodotto) | Pre-launch |
| D-09 | **`_headers` file per CSP** — Vercel-native | Security headers senza necessita di middleware server; compatibile anche con Netlify se migrazione futura | Pre-launch |
| D-10 | **PostHog per analytics** | Open source, privacy-first, self-hostable se necessario, SDK leggero | Fase 2 |
| D-11 | **Supabase EU region** | Compliance GDPR per utenti europei; dati non escono dall'UE | Pre-launch |
| D-12 | **Token-based invite flow** (`join.html`) | Sicuro, stateless, non richiede un sistema di inviti server-side complesso | Fase 2 |
| D-13 | **Prezzi in EUR** | Mercato target europeo; allineamento con Supabase EU region e GDPR positioning | Fase 3 |
| D-14 | **Deno runtime per Edge Functions** — Supabase nativo | Nessun server Node.js da gestire; cold start rapido; colocato con il database | Pre-launch |

---

## 7. Riferimento Rapido — Agenti e Responsabilita

| Task | Agente Claude |
|---|---|
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

---

## 8. Credenziali e Config (riferimento tecnico)

> Queste sono chiavi pubbliche/publishable. Non contengono segreti. Le chiavi service-role non devono MAI apparire nel client.

| Voce | Valore |
|---|---|
| Supabase URL | `https://ikgybeldlngntrpyzcnh.supabase.co` |
| Supabase Anon Key | `sb_publishable_RodF4T3p7nW1AVdkAmm3Lg_78pL2uPv` |
| Stripe Price ID — Pro (sandbox) | `price_1T7f8CFAY0SgGV6JuTDa4ZZl` |
| Stripe Price ID — Studio (sandbox) | `price_1T7f8RFAY0SgGV6JzfQSGvaP` |
| Stripe Price ID — Pro (live EUR) | Da creare al momento dello switch live |
| Stripe Price ID — Studio (live EUR) | Da creare al momento dello switch live |
| PostHog API Key | Placeholder — da sostituire con chiave reale |

---

*Documento creato: 19 marzo 2026 — Aggiornare questa sezione a ogni sessione con le modifiche rilevanti.*
