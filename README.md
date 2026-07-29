# BetTracker AI

Private decision-quality and risk-control platform for betting records. BetTracker helps a user record a decision before an event, check risk, account for the result correctly, and review the quality of the process.

## Current Status

- Production: `https://btdk.app`
- Engineering shell: **READY**
- Product Vision Beta: **NOT READY**
- External beta: **PAUSED**
- Current source of truth: [`PROJECT_STATE.md`](PROJECT_STATE.md)
- Product source of truth: [`docs/product.md`](docs/product.md) — approved R18 / Decision #069
- Target locales: English (`en`), українська (`uk`), русский (`ru`)
- First internal market profile: `GB_EW_SC` — England, Wales and Scotland; Northern Ireland excluded

The product is intentionally trust-gated: incomplete fixture, odds, enrichment, or AI context must not become model probability, edge, EV, recommendation, a ranked opportunity, or another betting signal.

## Stack

- Next.js 15 / React 19 / TypeScript
- Tailwind CSS
- Supabase Auth + PostgreSQL + RLS/RPC domain boundaries
- Anthropic API for bounded capture, explanation, and review workflows
- PostHog and Sentry
- Vercel

## Local Development

```bash
npm ci
npm run dev
```

Open `http://localhost:3000`.

Before opening a PR, run:

```bash
npm run test:extract-json
npm run test:provider-safety
npm run test:analysis-quality-gate
npm run test:financial-safety
npm run test:domain-write-boundaries
npm run test:agent-write-boundaries
npm run test:auth-invite
npm run test:fp001-quarantine
npm run test:rate-limit
npx tsc --noEmit
npm run lint
npm run build
```

## Environment

Create `.env.local` for local development. Never commit values.

### Core Supabase

```txt
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
NEXT_PUBLIC_SITE_URL
```

### AI

```txt
ANTHROPIC_API_KEY
ANTHROPIC_MODEL_ANALYST
ANTHROPIC_MODEL_SCANNER
ANTHROPIC_MODEL_SCOUT
ANTHROPIC_MODEL_COACH
```

### Sports providers

```txt
API_FOOTBALL_KEY
SPORTMONKS_TOKEN
API_TENNIS_KEY
```

### Operator and controlled-write controls

```txt
SPORTS_FIXTURE_SYNC_OPERATOR_TOKEN
SPORTS_FIXTURE_SYNC_WRITE_ENABLED
SPORTS_PROVIDER_LINK_WRITE_ENABLED
```

Write flags are normally absent/off and may be enabled only for an explicitly approved controlled operation, then removed immediately.

### Analytics / observability

```txt
NEXT_PUBLIC_POSTHOG_KEY
NEXT_PUBLIC_POSTHOG_HOST
NEXT_PUBLIC_SENTRY_DSN
SENTRY_DSN
SENTRY_AUTH_TOKEN
```

### Optional rate-limit overrides

The code has reviewed defaults; environment variables may override per-minute/day/hour values for Scanner, Analyst, Scout, Coach, and Register. See `lib/rate-limit.ts`.

## Database and Migrations

Do **not** follow the old instruction to run only `001_initial_schema.sql`.

- Numbered SQL files live in `supabase/migrations/` through 023; 008 is intentionally absent/historical.
- Production uses Supabase migration tooling for recent migrations, but earlier history includes manually applied objects and policy drift.
- A clean fresh-database bootstrap is not certified yet.
- `001_initial_schema.sql` contains destructive setup logic and must never be run casually against production.

Read [`docs/migration-state-reconciliation-053.md`](docs/migration-state-reconciliation-053.md) before applying or replaying any migration. Never apply a migration merely because its file exists.

## Repository Structure

```txt
app/                    Next.js pages and API routes
components/             shared UI and product components
lib/                    Supabase, AI trust, analytics, providers, rate limits
scripts/                safety and regression suites
docs/                   product, decisions, execution records, runbooks
supabase/migrations/     tracked SQL history (not a certified replay chain yet)
types/                  shared TypeScript types
```

There is no required `legacy/` directory in the current repository.

## Target Product Model

```txt
Research → Decision → Risk Check → Pass / Paper / Bet → Resolution → Review
```

`Decision` is the first-class object. A user may choose Pass or Paper without recording a Bet. A Bet is a separate user-owned record of an independently taken action. Financial execution is accounted for through reviewed ledger and Resolution contracts.

The target information architecture is Home, Research, Journal, Insights, and Risk, with global Add, Review, Search, Privacy View, Assistant, Tools, Notifications, Settings, and Trust Center. Web, iPhone, and Android share the same product contracts.

## Documentation

- [`PROJECT_STATE.md`](PROJECT_STATE.md) — current operational source of truth
- [`docs/product.md`](docs/product.md) — approved R18 product source of truth
- [`PRODUCT_VISION_GAP.md`](PRODUCT_VISION_GAP.md) — current implementation gap to R18
- [`docs/r18-implementation-map.md`](docs/r18-implementation-map.md) — R18 engineering PR map, dependencies, tests, flags, and gates
- [`docs/decision-069-target-product-structure.md`](docs/decision-069-target-product-structure.md) — product and market architecture decision
- [`docs/strategy.md`](docs/strategy.md) — level-1 strategy
- [`docs/decisions.md`](docs/decisions.md) — decision log
- [`docs/decision-ledger-numbering-governance.md`](docs/decision-ledger-numbering-governance.md) — numbering governance
- [`docs/migration-state-reconciliation-053.md`](docs/migration-state-reconciliation-053.md) — tracked vs production migration inventory

## Roles

- Founder / CEO: Дима
- CPO: ChatGPT
- Lead Engineer: Claude
