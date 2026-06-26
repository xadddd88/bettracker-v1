# BetTracker — Decision Log
> Every significant architectural, product, or strategic decision is recorded here.
> Format: Date | Decision # | What | Why | Alternatives | Consequences

---

## Decision #001 — Controlled Rebuild vs Refactor
**Date:** 2026-06-26  
**Proposed by:** CPO  
**Approved by:** Lead Engineer + CEO  

**Decision:** Controlled Rebuild. New Next.js project from scratch. Current `bettracker.html` becomes reference only.

**Why:**
- Current monolithic 4900-line HTML file cannot scale
- No TypeScript = no type safety, no refactor confidence
- No routing = impossible to add new screens cleanly
- localStorage state = unreliable across devices
- AI as single giant prompt = impossible to evolve into agent architecture
- Refactor would extend the life of an architecture that can't reach the product goal

**Alternatives considered:**
- Full Refactor (Vanilla JS): faster short-term, hits ceiling in 3–6 months
- Big Bang Rebuild (chaotic): risk of losing working business logic
- Controlled Rebuild: takes longer, but correct for 12+ month horizon

**Consequences:**
- Sprint 1 = infrastructure only, no new features
- Current prototype stays live on btdk.app during rebuild
- All business logic from bettracker.html must be audited and ported deliberately
- Estimated 2–3 weeks before first working page in new stack

---

## Decision #002 — Skip shadcn/ui in Sprint 1
**Date:** 2026-06-26  
**Proposed by:** Lead Engineer  
**Approved by:** CPO + CEO  

**Decision:** Use plain Tailwind CSS in Sprint 1. Evaluate component library at Sprint 2.

**Why:**
- shadcn/ui requires setup time and opinionated structure
- Sprint 1 goal is architecture, not UI polish
- Design language isn't stable enough yet to choose a component system
- Adding UI library too early can constrain design decisions later

**Alternatives considered:**
- shadcn/ui from day 1: more polish, but premature
- Radix UI: same issue
- No library ever: risk of inconsistency at scale

**Consequences:**
- Some UI repetition in Sprint 1 (acceptable)
- Component library decision deferred to Sprint 2 when design patterns are clearer

---

## Decision #003 — New Supabase Project
**Date:** 2026-06-26  
**Proposed by:** CPO  
**Approved by:** Lead Engineer + CEO  

**Decision:** Create new Supabase project for the rebuilt product. Old project used only as data migration source.

**Why:**
- Old schema has no migrations, no type safety, informal structure
- `bets` and `bankroll` tables have technical debt
- `global_config` RLS is broken (requires service_role workaround)
- Clean start allows proper schema design with migrations from day 1

**Alternatives considered:**
- Migrate old Supabase in-place: risk of breaking live prototype
- Keep old project: inherit all technical debt

**Consequences:**
- New Supabase project must be created by CEO before Sprint 1 starts
- Old project keys remain active for bettracker.html (prototype stays live)
- Migration script needed to port existing bets to new schema

---

## Decision #004 — Scanner upgraded from Haiku to Sonnet
**Date:** 2026-06-26  
**Proposed by:** Lead Engineer  
**Approved by:** CEO (tested, confirmed OCR errors)  

**Decision:** `scParseScreenshot()` now uses `claude-sonnet-4-6` instead of `claude-haiku-4-5-20251001`.

**Why:**
- Haiku produced OCR errors on team names (e.g., "Нидерланды" → "нимеченны", "Эквадор" → "Екадор")
- Sonnet is significantly better at reading text from images
- Cost difference is acceptable given low frequency of scanner usage

**Alternatives considered:**
- Prompt engineering on Haiku: already tried (added "read exactly as shown"), insufficient
- Two-step pipeline (Haiku scan → Sonnet correct): more complex, same end cost
- Sonnet directly: simplest solution, best quality

**Consequences:**
- Slightly higher API cost per scan (negligible)
- Significantly better team name accuracy

---

## Decision Template

```
## Decision #XXX — [Title]
**Date:** YYYY-MM-DD  
**Proposed by:** [CPO / Lead Engineer / CEO]  
**Approved by:** [Who approved]  

**Decision:** [One sentence — what was decided]

**Why:**
- [Reason 1]
- [Reason 2]

**Alternatives considered:**
- [Alt 1]: [why rejected]
- [Alt 2]: [why rejected]

**Consequences:**
- [What changes]
- [What risks]
```

---

*Last updated: 2026-06-26*  
*Owner: All (each role contributes)*

---

## Decision #005 — Decision-First Data Architecture
**Date:** 2026-06-26  
**Proposed by:** CPO  
**Approved by:** Lead Engineer + CEO  

**Decision:** `Decision` is the primary object of the system. `Bet` is the financial execution of a Decision. `BetLeg` decouples individual events from tickets for express/parlay support.

**Schema hierarchy:**
```
decisions
  └── ai_analysis_runs
bet_legs → decisions (nullable)
bets
  └── bet_legs
bankrolls
  └── bankroll_transactions → bets
profiles
```

**Why:**
- "We build not a history of bets, but a history of decisions"
- User can analyze and NOT bet — valid action, must be recordable
- User can bet without analysis (quick_entry) — must work
- Express bets need leg-level decision linking
- Enables future analytics: where AI was right, where user skipped value bets

**Key rules:**
- `bet_legs.decision_id` is nullable — allows imports and quick entry
- New UX should always create a Decision (even minimal one with `source = quick_entry`)
- `bankroll_transactions` tracks balance by events, not by direct mutation

**Alternatives considered:**
- `bets` table only (old Sprint 0 schema): loses the decision/analysis separation
- `decisions → bets` simple FK: breaks for express bets with multiple decisions

**Consequences:**
- `001_initial_schema.sql` rewritten before first migration (clean project, no rollback needed)
- `types/index.ts` updated to reflect new entities
- Dashboard/Bets pages need updating to query new schema (Sprint 1 task)
- `handle_new_user()` trigger auto-creates profile + default bankroll on signup
