# Sprint 8 — Event Pulse System

**Status:** Planned  
**CPO approval:** ✅  
**Goal:** Make BetTracker AI feel alive, premium, and event-aware without casino styling or fan-site aesthetics.

---

## 1. Base Visual Identity

### Philosophy
Premium sports-fintech. The product is a **serious analytical tool** that happens to live in the world of sport. References: Bloomberg Terminal meets ESPN Premium. Not Bet365. Not Reddit.

### Typography
| Role | Font | Weight | Usage |
|------|------|--------|-------|
| UI | `Geist Sans` (already Vercel ecosystem) | 400/500/600 | All text |
| Numbers / Stats | `Geist Mono` | 500 | Odds, percentages, bankroll figures |
| Display (optional) | `Geist Sans` | 700 | Hero headings only |

Swap from system font via `next/font/google` or `next/font/local` — zero layout shift.

### Base Color Tokens
```css
/* Background hierarchy */
--color-bg-base:      #080B12;   /* page background */
--color-bg-surface:   #0E1420;   /* cards */
--color-bg-elevated:  #141C2E;   /* modals, hover states */

/* Borders */
--color-border:       #1C2538;   /* default border */
--color-border-muted: #111827;   /* subtle divider */

/* Text */
--color-text-primary: #EDF2F7;
--color-text-muted:   #8896AE;
--color-text-faint:   #4A5568;

/* Brand accent */
--color-accent:       #3E7BFA;   /* electric blue — interactive, links, CTAs */
--color-accent-glow:  rgba(62, 123, 250, 0.15);

/* Semantic */
--color-win:          #10B981;   /* green */
--color-loss:         #EF4444;   /* red */
--color-warning:      #F59E0B;   /* amber */
--color-neutral:      #6B7280;
```

### Surface System (replaces ad-hoc card styles)
```css
.card {
  background: var(--color-bg-surface);
  border: 1px solid var(--color-border);
  border-radius: 12px;
}
.card:hover {
  border-color: var(--color-accent);
  box-shadow: 0 0 0 1px var(--color-accent-glow), 0 4px 24px rgba(0,0,0,0.4);
  transition: all 0.2s ease;
}
```

---

## 2. Event Pulse System — Architecture

### Concept
A thin event-aware layer that sits **on top** of the base identity. The base always wins structurally; the pulse only controls gradient, accent, and atmospheric texture. Intensity is controlled per tier so the base never gets drowned out.

### CSS Pulse Variables (overridden per active event)
```css
/* Default: no event */
--pulse-primary:    #3E7BFA;          /* same as accent */
--pulse-secondary:  #1C2538;          /* same as border */
--pulse-gradient:   transparent;      /* no overlay */
--pulse-texture:    none;
--pulse-intensity:  0;                /* 0 = off */
--pulse-label:      '';
```

These get injected on `<html>` by a tiny client component that reads the active event from the static config. No API call needed for MVP.

### Intensity by Tier
| Tier | Intensity | What changes |
|------|-----------|--------------|
| 1 — Global Pulse | 1.0 | Gradient overlay on bg, accent color, Event Pulse card, Scout chips, subtle texture |
| 2 — Iconic Pulse | 0.65 | Accent color shift, Event Pulse card, Scout chips. No texture. |
| 3 — Light Pulse | 0.3 | Scout chips only, small dashboard badge |

### Rotation Rules
- Only **one** main skin active at a time.
- If Tier 1 is active → it owns the skin unconditionally.
- If multiple Tier 2 active → rotate daily (key: `Math.floor(Date.now() / 86400000) % events.length`).
- Tier 3 events → shown as secondary chips in Scout, no skin change if Tier 1 or 2 is active.
- If no active event → base identity with no pulse.

---

## 3. Static Event Config

```typescript
// lib/events/event-config.ts

export type SportCode = 'football' | 'tennis' | 'basketball' | 'hockey' | 'american_football' | 'esports' | 'cycling' | 'baseball'

export interface PulseConfig {
  primaryColor: string       // CSS hex — main accent override
  secondaryColor: string     // CSS hex — secondary/glow
  gradientFrom: string       // CSS hex — bg gradient start
  gradientTo: string         // transparent or hex
  textureClass: string       // Tailwind class or '' — subtle bg pattern
  emoji: string              // displayed in card + chips
  scoutChips: string[]       // pre-filled Scout query suggestions
  dashboardLabel: string     // short label for Event Pulse card
}

export interface SportEvent {
  id: string
  name: string               // full name: "FIFA World Cup 2026"
  shortName: string          // "World Cup"
  tier: 1 | 2 | 3
  sport: SportCode
  startDate: string          // ISO date
  endDate: string            // ISO date
  pulse: PulseConfig
}

export const EVENTS: SportEvent[] = [
  // ─── TIER 1 ─────────────────────────────────────────────────
  {
    id: 'fifa-wc-2026',
    name: 'FIFA World Cup 2026',
    shortName: 'World Cup',
    tier: 1,
    sport: 'football',
    startDate: '2026-06-11',
    endDate: '2026-07-19',
    pulse: {
      primaryColor:   '#2D9C5F',   // pitch green
      secondaryColor: '#D4AF37',   // gold
      gradientFrom:   '#0A1F14',   // deep green-black
      gradientTo:     'transparent',
      textureClass:   'bg-[radial-gradient(ellipse_at_top,_#0A1F14_0%,_transparent_70%)]',
      emoji:          '🏆',
      scoutChips:     ['World Cup 2026 value bets', 'Group stage upsets', 'Top scorer markets'],
      dashboardLabel: 'FIFA World Cup 2026 · Live',
    },
  },
  {
    id: 'uefa-euro-2028',
    name: 'UEFA Euro 2028',
    shortName: 'Euro 2028',
    tier: 1,
    sport: 'football',
    startDate: '2028-06-09',
    endDate: '2028-07-11',
    pulse: {
      primaryColor:   '#1A56DB',
      secondaryColor: '#FFD700',
      gradientFrom:   '#080D1F',
      gradientTo:     'transparent',
      textureClass:   '',
      emoji:          '⭐',
      scoutChips:     ['Euro 2028 group stage', 'Dark horse nations', 'Top scorer markets'],
      dashboardLabel: 'UEFA Euro 2028 · Live',
    },
  },

  // ─── TIER 2 ─────────────────────────────────────────────────
  {
    id: 'wimbledon-2026',
    name: 'The Championships, Wimbledon 2026',
    shortName: 'Wimbledon',
    tier: 2,
    sport: 'tennis',
    startDate: '2026-06-29',
    endDate: '2026-07-13',
    pulse: {
      primaryColor:   '#4A7C59',   // grass court green
      secondaryColor: '#5B2C8D',   // Wimbledon purple
      gradientFrom:   '#0A160D',
      gradientTo:     'transparent',
      textureClass:   '',
      emoji:          '🎾',
      scoutChips:     ['Wimbledon 2026 upsets', 'Grass court specialists', 'Quarter-final markets'],
      dashboardLabel: 'Wimbledon 2026 · Live',
    },
  },
  {
    id: 'roland-garros-2027',
    name: 'Roland Garros 2027',
    shortName: 'Roland Garros',
    tier: 2,
    sport: 'tennis',
    startDate: '2027-05-25',
    endDate: '2027-06-08',
    pulse: {
      primaryColor:   '#C94A2E',   // clay red
      secondaryColor: '#F5E642',   // yellow-green
      gradientFrom:   '#1A0A08',
      gradientTo:     'transparent',
      textureClass:   '',
      emoji:          '🎾',
      scoutChips:     ['Roland Garros clay specialists', 'Upset picks', 'Set betting markets'],
      dashboardLabel: 'Roland Garros 2027 · Live',
    },
  },
  {
    id: 'nba-finals-2027',
    name: 'NBA Finals 2027',
    shortName: 'NBA Finals',
    tier: 2,
    sport: 'basketball',
    startDate: '2027-06-01',
    endDate: '2027-06-22',
    pulse: {
      primaryColor:   '#C9A227',   // championship gold
      secondaryColor: '#1D428A',   // NBA blue
      gradientFrom:   '#0F0C00',
      gradientTo:     'transparent',
      textureClass:   '',
      emoji:          '🏀',
      scoutChips:     ['NBA Finals Game markets', 'Series length betting', 'MVP markets'],
      dashboardLabel: 'NBA Finals 2027 · Live',
    },
  },
  {
    id: 'super-bowl-lxi',
    name: 'Super Bowl LXI',
    shortName: 'Super Bowl',
    tier: 2,
    sport: 'american_football',
    startDate: '2027-02-07',
    endDate: '2027-02-07',
    pulse: {
      primaryColor:   '#C41E3A',
      secondaryColor: '#D4AF37',
      gradientFrom:   '#120008',
      gradientTo:     'transparent',
      textureClass:   '',
      emoji:          '🏈',
      scoutChips:     ['Super Bowl prop bets', 'First scorer markets', 'Total points'],
      dashboardLabel: 'Super Bowl LXI · Today',
    },
  },
  {
    id: 'ucl-final-2027',
    name: 'UEFA Champions League Final 2027',
    shortName: 'UCL Final',
    tier: 2,
    sport: 'football',
    startDate: '2027-05-29',
    endDate: '2027-05-29',
    pulse: {
      primaryColor:   '#1A4DB3',
      secondaryColor: '#D4AF37',
      gradientFrom:   '#080D1A',
      gradientTo:     'transparent',
      textureClass:   '',
      emoji:          '⭐',
      scoutChips:     ['UCL Final both teams to score', 'First goalscorer', 'Correct score'],
      dashboardLabel: 'Champions League Final · Today',
    },
  },
  {
    id: 'stanley-cup-2027',
    name: 'Stanley Cup Finals 2027',
    shortName: 'Stanley Cup',
    tier: 2,
    sport: 'hockey',
    startDate: '2027-05-28',
    endDate: '2027-06-18',
    pulse: {
      primaryColor:   '#A8B8CC',
      secondaryColor: '#1A3A5C',
      gradientFrom:   '#080C12',
      gradientTo:     'transparent',
      textureClass:   '',
      emoji:          '🏒',
      scoutChips:     ['Stanley Cup series markets', 'Game winner', 'Puck line betting'],
      dashboardLabel: 'Stanley Cup Finals 2027 · Live',
    },
  },

  // ─── TIER 3 ─────────────────────────────────────────────────
  {
    id: 'copa-america-2028',
    name: 'Copa América 2028',
    shortName: 'Copa América',
    tier: 3,
    sport: 'football',
    startDate: '2028-06-14',
    endDate: '2028-07-14',
    pulse: {
      primaryColor:   '#FFD700',
      secondaryColor: '#228B22',
      gradientFrom:   'transparent',
      gradientTo:     'transparent',
      textureClass:   '',
      emoji:          '🌎',
      scoutChips:     ['Copa América group stage', 'South American specialists'],
      dashboardLabel: 'Copa América 2028',
    },
  },
  {
    id: 'tour-de-france-2027',
    name: 'Tour de France 2027',
    shortName: 'Tour de France',
    tier: 3,
    sport: 'cycling',
    startDate: '2027-07-01',
    endDate: '2027-07-23',
    pulse: {
      primaryColor:   '#FFD700',
      secondaryColor: '#E63946',
      gradientFrom:   'transparent',
      gradientTo:     'transparent',
      textureClass:   '',
      emoji:          '🚴',
      scoutChips:     ['Stage winner markets', 'GC top 3'],
      dashboardLabel: 'Tour de France 2027',
    },
  },
  {
    id: 'cs2-major-2026',
    name: 'CS2 Major 2026',
    shortName: 'CS2 Major',
    tier: 3,
    sport: 'esports',
    startDate: '2026-09-01',   // placeholder
    endDate: '2026-09-15',
    pulse: {
      primaryColor:   '#F5A623',
      secondaryColor: '#1A1A2E',
      gradientFrom:   'transparent',
      gradientTo:     'transparent',
      textureClass:   '',
      emoji:          '🎮',
      scoutChips:     ['CS2 Major map markets', 'Pistol round winner', 'MVP'],
      dashboardLabel: 'CS2 Major 2026',
    },
  },
]
```

---

## 4. Active Event Resolution

```typescript
// lib/events/active-event.ts

import { EVENTS, SportEvent } from './event-config'

export function getActiveEvents(): { main: SportEvent | null; secondary: SportEvent[] } {
  const today = new Date().toISOString().slice(0, 10)
  const active = EVENTS.filter(e => e.startDate <= today && e.endDate >= today)

  const tier1 = active.find(e => e.tier === 1) ?? null
  if (tier1) {
    return { main: tier1, secondary: active.filter(e => e !== tier1) }
  }

  const tier2 = active.filter(e => e.tier === 2)
  if (tier2.length > 0) {
    const dayIndex = Math.floor(Date.now() / 86_400_000) % tier2.length
    return { main: tier2[dayIndex], secondary: [...tier2.filter((_, i) => i !== dayIndex), ...active.filter(e => e.tier === 3)] }
  }

  const tier3 = active.filter(e => e.tier === 3)
  return { main: null, secondary: tier3 }
}
```

---

## 5. PulseProvider Component

```tsx
// components/pulse/PulseProvider.tsx
'use client'
import { useEffect } from 'react'
import { getActiveEvents } from '@/lib/events/active-event'

export function PulseProvider() {
  useEffect(() => {
    const { main } = getActiveEvents()
    if (!main) return
    const root = document.documentElement
    root.style.setProperty('--pulse-primary',   main.pulse.primaryColor)
    root.style.setProperty('--pulse-secondary',  main.pulse.secondaryColor)
    root.style.setProperty('--pulse-gradient-from', main.pulse.gradientFrom)
    root.style.setProperty('--pulse-intensity',  String(main.tier === 1 ? 1 : main.tier === 2 ? 0.65 : 0.3))
  }, [])
  return null
}
```

Added once to `app/layout.tsx`, no API, no server load.

---

## 6. Dashboard — Event Pulse Card

```tsx
// components/pulse/EventPulseCard.tsx
import { getActiveEvents } from '@/lib/events/active-event'
import Link from 'next/link'

export function EventPulseCard() {
  const { main, secondary } = getActiveEvents()
  if (!main && secondary.length === 0) return null

  const event = main ?? secondary[0]

  return (
    <div className="card border-[var(--pulse-primary)]/30 bg-[var(--pulse-gradient-from)]/20 p-4 flex items-center gap-3">
      <span className="text-2xl">{event.pulse.emoji}</span>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-[var(--pulse-primary)] uppercase tracking-wider">
          {main ? (event.tier === 1 ? 'Global Pulse' : 'Event Pulse') : 'On Radar'}
        </p>
        <p className="text-sm font-semibold text-slate-200 truncate">{event.pulse.dashboardLabel}</p>
        {secondary.length > 0 && (
          <p className="text-[11px] text-slate-500 mt-0.5">
            Also live: {secondary.slice(0,2).map(e => e.shortName).join(', ')}
          </p>
        )}
      </div>
      <Link href="/ai?pulse=1" className="btn-ghost text-xs px-3 py-1.5 shrink-0">
        Scout it →
      </Link>
    </div>
  )
}
```

---

## 7. Scout — Event Preset Chips

```tsx
// in ScoutForm.tsx — above the main input
function EventChips() {
  const { main, secondary } = getActiveEvents()
  const chips = [
    ...(main ? main.pulse.scoutChips.slice(0, 2).map(c => ({ label: c, emoji: main.pulse.emoji })) : []),
    ...secondary.flatMap(e => e.pulse.scoutChips.slice(0, 1).map(c => ({ label: c, emoji: e.pulse.emoji }))),
  ].slice(0, 4)

  if (chips.length === 0) return null

  return (
    <div className="flex flex-wrap gap-2 mb-3">
      {chips.map(chip => (
        <button
          key={chip.label}
          className="text-[11px] px-2.5 py-1 rounded-full border border-[var(--pulse-primary)]/40
                     text-slate-300 hover:border-[var(--pulse-primary)] hover:text-[var(--pulse-primary)]
                     transition-colors bg-[var(--pulse-primary)]/5"
          onClick={() => {/* set Scout query to chip.label */}}
        >
          {chip.emoji} {chip.label}
        </button>
      ))}
    </div>
  )
}
```

---

## 8. MVP Scope (Sprint 8)

### In scope
- [ ] Install Geist font via `next/font`
- [ ] Migrate all hardcoded colors to CSS token variables
- [ ] `lib/events/event-config.ts` — static config with all events above
- [ ] `lib/events/active-event.ts` — resolution logic
- [ ] `components/pulse/PulseProvider.tsx` — injects CSS vars
- [ ] `components/pulse/EventPulseCard.tsx` — dashboard card
- [ ] Event chips in `ScoutForm.tsx`
- [ ] Two skins implemented and tested: **FIFA World Cup 2026**, **Wimbledon 2026**
- [ ] Migration 009 applied (match_date — from PR #24)
- [ ] Visual QA: not casino, not fan site, premium fintech feel

### Out of scope (future)
- Live sports API integration
- User-controlled skin preferences
- Odds feed
- Animation system (phase 2)
- Server-side event injection (SSR — not needed for MVP)

---

## 9. Design Rules (non-negotiable)

1. **No official logos, crests, wordmarks.** Event-inspired only.
2. **No neon, no flashing, no gradients with >3 colors.** One atmospheric gradient max.
3. **Base identity always readable.** Pulse is atmosphere, not noise.
4. **Pulse never changes layout.** Only color tokens and one optional gradient overlay.
5. **Accessibility:** pulse colors must pass AA contrast on `--color-bg-surface`.
6. **No casino patterns:** no gold/red/green overload, no spinning animations.

---

## Definition of Done

- [ ] Geist font active sitewide
- [ ] Base color token system in `globals.css`
- [ ] Active event resolved correctly for today's date
- [ ] Dashboard shows EventPulseCard for World Cup + Wimbledon (both active today)
- [ ] Scout shows event chips
- [ ] Site feels premium, alive, event-aware — not a casino
- [ ] CPO smoke test pass
