# Migration State Reconciliation — Decision #053

Status: INVENTORY / DOCUMENTATION ONLY  
Last updated: 2026-07-11

No migration was applied, replayed, reverted, or modified by Decision #053.

## Tracked SQL Files

The repository currently contains:

- `001_initial_schema.sql`
- `002_sprint2_schema.sql`
- `003_settlement.sql`
- `004_scout.sql`
- `005_coach.sql`
- `006_beta_access.sql`
- `007_beta_readiness.sql`
- `009_scout_match_date.sql`
- `010_security_hardening.sql`
- `011_rls_initplan_perf.sql`
- `012_settle_bet_fixes.sql`
- `013_sports_data_foundation.sql`
- `014_sports_data_foundation_cleanup.sql`
- `015_odds_snapshots_public_view.sql`
- `016_atomic_financial_writes.sql`
- `017_prepare_domain_write_boundaries.sql`
- `018_enforce_domain_write_boundaries.sql`
- `019_prepare_agent_write_boundaries.sql`
- `020_enforce_agent_write_boundaries.sql`
- `021_beta_access_invite_flow.sql`
- `022_fp001_legacy_quarantine.sql`
- `023_global_rate_limits.sql`

Numbering note: there is no tracked `008` migration file. Do not invent or backfill it.

## Production Migration Ledger (Recent Tooling History)

The production Supabase ledger records recent timestamped applications:

| Production version | Name |
|---|---|
| `20260630172508` | `012_settle_bet_fixes` |
| `20260705175448` | `odds_snapshots_public_view` |
| `20260705175619` | `odds_snapshots_public_view_lockdown` |
| `20260710152051` | `atomic_financial_writes_016` |
| `20260710165907` | `prepare_domain_write_boundaries_017` |
| `20260710170236` | `enforce_domain_write_boundaries_018` |
| `20260710174832` | `prepare_agent_write_boundaries_019` |
| `20260710175148` | `enforce_agent_write_boundaries_020` |
| `20260710182225` | `beta_access_invite_flow_021` |
| `20260710183632` | `fp001_legacy_quarantine_022` |
| `20260711044511` | `global_rate_limits_023` |

This ledger is not the complete historical story. Earlier schema objects were created manually or before consistent migration tooling, so absence from the timestamped ledger does not mean an object is absent from production.

## Known Drift and Bootstrap Risks

| Area | Reconciled fact | Operational consequence |
|---|---|---|
| Missing 008 | Tracked numbering jumps from 007 to 009 | Preserve the gap; do not fabricate a migration |
| `update_updated_at_column()` | Historical function exists in production but is not defined by the tracked migration chain; old files reference it | A clean replay can fail before later migrations; fresh bootstrap is not certified |
| Coaching policies | Tracked migration 005 created `Users see own sessions` (`FOR ALL`); production later used split select/insert names | Migration 020 deliberately drops all known names; historical drift remains documented |
| Review-only files | Migrations 010, 011, and 013 are marked review/manual in their source history | Never auto-apply solely by filename |
| Migration 014 | Was applied in production before its merge record was finalized | Treat production evidence and repository history as separate audit signals |
| Migration 001 | Contains destructive initialization/drop behavior | Never run against production as a generic setup step |
| Timestamped ledger | Recent production names differ from repository filenames | Map by reviewed content and execution record, not by numeric filename alone |

## Safe Migration Rules

1. Never run `001_initial_schema.sql` on production as a quick-start command.
2. Never replay all numbered files against production.
3. Before any migration, compare repository SQL, production objects, grants/policies, and the Supabase migration ledger.
4. Apply only the exact CPO-reviewed file through approved migration tooling.
5. Verify functions, constraints, grants, policies, RLS, and data invariants immediately after apply.
6. Record sanitized execution evidence in a PR.
7. Fresh-database bootstrap requires a separate reconciliation decision and test environment.

## PR Disposition Recorded by #053

- PR #106 (`/odds/mapping` filter evidence): superseded and closed. Its conclusion is already in main — filter support is unconfirmed and filtered runtime stays blocked.
- PR #90 (Third-Party Manual Context Policy): closed without merge. The policy is not adopted; Decision #020 is invalid and never reused. Any revival requires a new PR under #055 or later.

## Remaining Manual Verification

Decision #050 remains deployed/route-verified but awaits the founder's real SMTP invite round-trip. This is not a migration-ledger blocker and is not folded into Decision #053.
