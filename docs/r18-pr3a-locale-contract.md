# R18 PR3A Locale Contract

Status: COMPLETE — merged in PR #253 and deployed from `main@486266a6a066f891060166d2cb55678d22f915b3`.
Date: 2026-08-12

PR3A is a repository-only precursor to the broader R18 MarketProfile and eligibility work. It narrows the active UI and API output-language contract without changing production data or enabling any market.

## Execution Record

- GitHub PR: `#253` (`agent/r18-pr3a-locale-contract` -> `main`).
- Merge commit: `486266a6a066f891060166d2cb55678d22f915b3`.
- Required checks: 15/15 passed, including Hermetic Web acceptance, Typecheck & lint, safety suites, PostgreSQL 17 gates, and Vercel Preview.
- Production deployment: `dpl_jrDXN1UzdaJnDU5WuHaZiNHoZkqa`, state `READY`, aliases include `btdk.app`.
- Post-deploy smoke: public `GET /login` returned `200` from that deployment; the immediate deployment-scoped error/fatal log scan returned no entries.
- Data-plane changes: none. No migration, stored-row rewrite, market enablement, environment change, or provider execution occurred.

## Contract

| Boundary | Allowed value | Legacy handling |
|---|---|---|
| Analyst and Scout selectors | `en`, `uk`, `ru` | Legacy values are not displayed. |
| Analyst and Scout request schemas | `en`, `uk`, `ru` | `auto`, `es`, `fr`, `de`, and `ar` fail validation before profile/provider/persistence work. |
| Historical stored analysis reads | `en`, `uk`, `ru` | Any unsupported or missing stored value resolves to English copy; no row is rewritten. |
| Shared TypeScript request type | `UiLocale` | New typed callers cannot submit legacy values. |

The canonical definitions live in `lib/i18n/ui-locale.ts`. This module is intentionally pure so Route Handlers and Client Components share the same values without crossing server-only dependencies into the browser bundle.

## Verification

- `npm run test:locale-contract`
- `npm run test:analysis-quality-gate`
- `npm run test:provider-safety`
- `npm run test:rate-limit`
- `npm run test:design-scanner`
- `npm run test:design-rollout`
- `npm run test:design-stats`
- `npx tsc --noEmit`
- `npm run lint`
- `git diff --check`

All route tests are hermetic. They use local fakes and assert that invalid legacy locale requests do not reach Supabase profile reads, provider construction, persistence, or analytics.

## Explicitly Out Of Scope

- Supabase or PostgreSQL migrations.
- `MarketProfile`, `UserMarketEligibility`, consent storage, or legal enablement.
- Translation-catalog completion for all R18 surfaces.
- Rewriting historical records or historical baseline fixtures.
- Environment changes, provider calls, deployment, production smoke, or production writes.
