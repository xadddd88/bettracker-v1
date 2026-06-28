# Claude Code Rules

Claude Code is the implementation agent for BetTracker AI.

## Role

```
CPO spec
→ Lead Engineer review
→ Claude Code implementation
→ build / lint
→ smoke test
→ CPO acceptance
```

## Rules

- Read `/docs` before implementing sprint work.
- Implement exactly what the CPO spec says. No scope expansion.
- Do not change product philosophy without ADR.
- Do not bypass database safety rules (RLS, auth.uid(), FOR UPDATE locks).
- Do not modify production data directly.
- All database changes must go through numbered migration files.
- Run `npm run build` after every implementation.
- Run `npm run lint` after every implementation.
- Return: changed files, migration summary, build result, lint result, risks.

## Required Return Format

```
Implementation summary:
- Files changed: ...
- Migrations added: ...
- RPC added/updated: ...
- API routes added/updated: ...
- UI updated: ...

Validation:
- npm run build: pass / fail
- npm run lint: pass / fail

Smoke test notes:
- ...

Known risks:
- ...
```

## Security Rules

- Never trust client-supplied `user_id`. Always use `auth.uid()` inside RPCs.
- All RPCs must use `SECURITY DEFINER SET search_path = public`.
- RLS must be enabled on all tables.
- `FOR UPDATE` lock required on bet row before settlement.

## Scope Boundaries

Claude Code must not add without explicit CPO approval:
- cashout
- half-won / half-lost
- live odds
- bookmaker sync
- auto-settlement
- new sports outside canonical list
- new languages outside supported list
