# BetTracker Release Checklist

Owner: Dmitriy Khodakivskyi

Use this checklist for every production release. A checked item must have verifiable evidence. Merge, migration, deploy, environment/secret changes, feature-flag activation, and rollback are separate authorization boundaries.

## 1. Release identity

- [ ] Linear issue is linked
- [ ] Draft PR is linked
- [ ] exact head SHA is recorded
- [ ] user-visible outcome and excluded scope are explicit
- [ ] affected surfaces are listed: Web / mobile / API / Supabase / analytics

## 2. Scope and safety

- [ ] diff contains only approved scope
- [ ] unrelated local/user changes are absent
- [ ] financial formulas and settlement boundaries are identified
- [ ] auth, RLS and privacy impact is identified
- [ ] provider/AI calls and write flags are identified
- [ ] migration, env and feature-flag impact is identified
- [ ] rollback path is executable and fail-closed

## 3. Quality gates

- [ ] `git diff --check`
- [ ] TypeScript passes
- [ ] lint passes with no new errors
- [ ] focused tests pass
- [ ] financial safety passes when relevant
- [ ] production build passes with safe placeholders
- [ ] Preview deployment is READY
- [ ] browser/smoke verification passes
- [ ] migration verifier passes when relevant

Record commands, test counts, workflow URLs and Preview URL in the PR.

## 4. Founder authorization

Record Dmitriy's exact permission and timestamp for each action that applies:

- [ ] merge authorized
- [ ] migration authorized
- [ ] production deploy authorized
- [ ] env/secret change authorized
- [ ] feature-flag enablement authorized
- [ ] rollback authorized

Unchecked actions are not authorized. “Делаем”, “идём дальше” or approval of a different action does not expand the scope.

## 5. Preflight

- [ ] current `main` and PR mergeability rechecked
- [ ] all required CI checks are green on exact head
- [ ] production health checked before change
- [ ] Supabase project and migration state verified
- [ ] rollback owner and trigger are defined
- [ ] no concurrent release conflicts exist

## 6. Execution

Perform only explicitly authorized actions and record immutable identifiers:

- merge commit SHA:
- migration number/result:
- Vercel deployment ID:
- production URL:
- feature flag/env change:

## 7. Postflight

- [ ] [btdk.app](https://btdk.app) responds successfully
- [ ] production deployment is READY
- [ ] production SHA matches the approved release
- [ ] Vercel critical logs checked
- [ ] Supabase is healthy
- [ ] expected migrations are applied exactly once
- [ ] critical user journey passes
- [ ] PostHog/Sentry signals checked where relevant
- [ ] no unexpected writes, duplicates or data exposure detected

## 8. Verdict

Choose exactly one:

- **PASS** — release is healthy and evidence is complete.
- **HOLD** — stop; do not retry or expand scope until the blocker is understood.
- **ROLLBACK** — execute only after explicit rollback authorization, then repeat postflight.

## 9. Closure

- [ ] Linear issue updated with verdict and evidence
- [ ] PR contains final production identifiers
- [ ] Slack `#bettracker` receives the concise release result
- [ ] follow-up issues are created for deferred scope
