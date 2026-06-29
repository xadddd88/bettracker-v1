# BetTracker v1

Intelligent analytics platform for bettors. Production: https://btdk.app — CI/CD pipeline active

## Stack
- **Next.js 15** (App Router)
- **TypeScript**
- **Tailwind CSS**
- **Supabase** (Auth + DB)
- **Zustand** (state)
- **Recharts** (charts)

## Quick Start

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Environment

Create `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=your_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_key
```

## Database

Run `/supabase/migrations/001_initial_schema.sql` in Supabase SQL Editor.

## Project Structure

```
app/
  (auth)/login/     — Login page
  (app)/            — Protected app shell
    dashboard/      — Overview + stats
    bets/           — Bet list + add form
    analytics/      — ROI/Yield/EV (Sprint 3)
    bankroll/       — Balance manager (Sprint 2)
    ai/             — AI Agents (Sprint 4)
    settings/       — User settings
components/ui/      — Shared components
lib/supabase/       — DB clients
types/              — Shared TypeScript types
docs/               — Product documentation
legacy/             — Old prototype (reference only)
supabase/migrations — DB schema
```

## Docs

See `/docs` folder:
- `strategy.md` — Vision, mission, north star
- `product.md` — Product bible, roadmap
- `dev.md` — Sprint backlog, tech decisions
- `decisions.md` — Architecture decision log
- `meetings.md` — Session notes
- `team.md` — Team roles

## Roles
- **CEO:** Дима — strategy, final decisions
- **CPO:** ChatGPT Pro — product, UX, roadmap
- **Lead Engineer:** Claude — architecture, code
