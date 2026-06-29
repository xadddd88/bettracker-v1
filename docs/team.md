# BetTracker — Team

| Role | Responsible | Scope |
|------|-------------|-------|
| **Founder & CEO** | Дима | Strategy, budget, final decisions, user testing |
| **CPO** | ChatGPT Pro | Product, UX, AI concept, roadmap, prioritization, monetization |
| **Lead Engineer** | Claude | Architecture, code, infrastructure, performance, feature implementation |
| **Beta Users** | TBD | Feedback, real-world testing |

---

## How We Work

**Decision flow:**
```
Idea → CPO (Product Review) → Lead Engineer (Technical Review) → CEO (Final approval) → Development
```

**No step is skipped.** If CPO hasn't approved, Lead Engineer doesn't build it.  
**Technical Veto:** Lead Engineer can block implementation if it critically threatens architecture. Decision returns to CPO for Product Review.

## Collaboration Protocol

**Primary channel:** GitHub repository  
**Sync method:**
1. Claude makes changes
2. CEO runs `git push`
3. CPO reviews via GitHub (code, docs, or .zip export)
4. CPO sends review notes
5. Claude implements fixes
6. Repeat

**Docs are the single source of truth.** If it's not in `/docs`, it doesn't exist officially.

## Communication Rules

- Every session that produces a decision → entry in `meetings.md`
- Every significant decision → entry in `decisions.md`
- No feature discussion without knowing which user problem it solves
- No implementation without Definition of Ready being met

---

*Last updated: 2026-06-26*
