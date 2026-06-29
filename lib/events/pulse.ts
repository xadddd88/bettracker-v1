export type PulseTheme =
  | 'football'
  | 'grass-tennis'
  | 'clay-tennis'
  | 'hard-tennis'
  | 'basketball'
  | 'hockey'
  | 'american-football'
  | 'esports'
  | 'neutral'

export interface PulseEvent {
  id: string
  label: string
  sublabel?: string
  icon: string
  tier: 1 | 2 | 3
  theme: PulseTheme
  sport: string
  startDate: string  // YYYY-MM-DD
  endDate: string    // YYYY-MM-DD
  scoutPreset?: { sport: string; context: string }
  dashboardCta?: { label: string; href: string }
}

export interface ThemeTokens {
  accent:    string
  bg:        string
  border:    string
  badgeBg:   string
  badgeText: string
  glowBg:    string
  texture:   string | null
}

export const THEME_TOKENS: Record<PulseTheme, ThemeTokens> = {
  football: {
    accent:    '#166534',
    bg:        'linear-gradient(135deg, #091409 0%, #0f1629 60%)',
    border:    'rgba(22,101,52,0.4)',
    badgeBg:   'rgba(20,83,45,0.3)',
    badgeText: '#4ade80',
    glowBg:    'radial-gradient(ellipse at 50% 0%, rgba(22,101,52,0.18) 0%, transparent 70%)',
    texture:   'repeating-linear-gradient(0deg, rgba(22,101,52,0.07) 0px, rgba(22,101,52,0.07) 1px, transparent 1px, transparent 12px)',
  },
  'grass-tennis': {
    accent:    '#14532d',
    bg:        'linear-gradient(135deg, #06110a 0%, #0f1629 65%)',
    border:    'rgba(20,83,45,0.45)',
    badgeBg:   'rgba(5,46,22,0.4)',
    badgeText: '#4ade80',
    glowBg:    'radial-gradient(ellipse at 50% 0%, rgba(20,83,45,0.15) 0%, transparent 70%)',
    texture:   'repeating-linear-gradient(-45deg, rgba(20,83,45,0.06) 0px, rgba(20,83,45,0.06) 1px, transparent 1px, transparent 8px)',
  },
  'clay-tennis': {
    accent:    '#7c2d12',
    bg:        'linear-gradient(135deg, #150803 0%, #0f1629 65%)',
    border:    'rgba(124,45,18,0.4)',
    badgeBg:   'rgba(124,45,18,0.2)',
    badgeText: '#fb923c',
    glowBg:    'radial-gradient(ellipse at 50% 0%, rgba(124,45,18,0.15) 0%, transparent 70%)',
    texture:   'repeating-linear-gradient(0deg, rgba(124,45,18,0.07) 0px, rgba(124,45,18,0.07) 1px, transparent 1px, transparent 10px)',
  },
  'hard-tennis': {
    accent:    '#1e3a5f',
    bg:        'linear-gradient(135deg, #04101a 0%, #0f1629 65%)',
    border:    'rgba(30,58,95,0.5)',
    badgeBg:   'rgba(30,58,95,0.3)',
    badgeText: '#60a5fa',
    glowBg:    'radial-gradient(ellipse at 50% 0%, rgba(30,58,95,0.15) 0%, transparent 70%)',
    texture:   null,
  },
  basketball: {
    accent:    '#7c2d12',
    bg:        'linear-gradient(135deg, #150500 0%, #0f1629 65%)',
    border:    'rgba(234,88,12,0.3)',
    badgeBg:   'rgba(124,45,18,0.25)',
    badgeText: '#fb923c',
    glowBg:    'radial-gradient(ellipse at 50% 0%, rgba(234,88,12,0.12) 0%, transparent 70%)',
    texture:   null,
  },
  hockey: {
    accent:    '#1e3a5f',
    bg:        'linear-gradient(135deg, #04101f 0%, #0f1629 60%)',
    border:    'rgba(30,58,95,0.4)',
    badgeBg:   'rgba(30,58,95,0.3)',
    badgeText: '#60a5fa',
    glowBg:    'radial-gradient(ellipse at 50% 0%, rgba(30,58,95,0.14) 0%, transparent 70%)',
    texture:   null,
  },
  'american-football': {
    accent:    '#7f1d1d',
    bg:        'linear-gradient(135deg, #140404 0%, #0f1629 65%)',
    border:    'rgba(127,29,29,0.4)',
    badgeBg:   'rgba(127,29,29,0.25)',
    badgeText: '#f87171',
    glowBg:    'radial-gradient(ellipse at 50% 0%, rgba(127,29,29,0.15) 0%, transparent 70%)',
    texture:   null,
  },
  esports: {
    accent:    '#3730a3',
    bg:        'linear-gradient(135deg, #060510 0%, #0f1629 65%)',
    border:    'rgba(99,102,241,0.3)',
    badgeBg:   'rgba(55,48,163,0.25)',
    badgeText: '#a5b4fc',
    glowBg:    'radial-gradient(ellipse at 50% 0%, rgba(99,102,241,0.12) 0%, transparent 70%)',
    texture:   null,
  },
  neutral: {
    accent:    '#334155',
    bg:        'linear-gradient(135deg, #0a0f18 0%, #0f1629 60%)',
    border:    'rgba(51,65,85,0.6)',
    badgeBg:   'rgba(30,38,64,0.4)',
    badgeText: '#94a3b8',
    glowBg:    'radial-gradient(ellipse at 50% 0%, rgba(51,65,85,0.12) 0%, transparent 70%)',
    texture:   null,
  },
}

// ─── Static event registry ────────────────────────────────────
// Dates are YYYY-MM-DD. Update annually; no live API needed.
const PULSE_EVENTS: PulseEvent[] = [
  // ── Tier 1: Global Pulse ─────────────────────────────────────
  {
    id: 'fifa-wc-2026',
    label: 'FIFA World Cup 2026',
    sublabel: 'USA · Canada · Mexico',
    icon: '🏆',
    tier: 1,
    theme: 'football',
    sport: 'soccer',
    startDate: '2026-06-11',
    endDate:   '2026-07-19',
    scoutPreset: {
      sport:   'soccer',
      context: 'FIFA World Cup 2026 — group stage fixtures, underdog value, and emerging tournament patterns.',
    },
    dashboardCta: { label: 'Scout World Cup', href: '/scout' },
  },

  // ── Tier 2: Iconic Pulse ─────────────────────────────────────
  {
    id: 'wimbledon-2026',
    label: 'The Championships · Wimbledon',
    sublabel: 'Grass Court',
    icon: '🎾',
    tier: 2,
    theme: 'grass-tennis',
    sport: 'tennis',
    startDate: '2026-06-29',
    endDate:   '2026-07-12',
    scoutPreset: {
      sport:   'tennis',
      context: 'Wimbledon 2026 — grass specialists, serve-and-volley form, surface-specific H2H.',
    },
    dashboardCta: { label: 'Scout Wimbledon', href: '/scout' },
  },
  {
    id: 'roland-garros-2026',
    label: 'Roland Garros 2026',
    sublabel: 'Clay Court',
    icon: '🎾',
    tier: 2,
    theme: 'clay-tennis',
    sport: 'tennis',
    startDate: '2026-05-24',
    endDate:   '2026-06-07',
    scoutPreset: {
      sport:   'tennis',
      context: 'Roland Garros 2026 — clay specialists, topspin baseliners, surface H2H trends.',
    },
    dashboardCta: { label: 'Scout Roland Garros', href: '/scout' },
  },
  {
    id: 'australian-open-2026',
    label: 'Australian Open 2026',
    sublabel: 'Hard Court',
    icon: '🎾',
    tier: 2,
    theme: 'hard-tennis',
    sport: 'tennis',
    startDate: '2026-01-19',
    endDate:   '2026-02-01',
    scoutPreset: {
      sport:   'tennis',
      context: 'Australian Open 2026 — hard court form, heat conditions, early-round value in deep draws.',
    },
    dashboardCta: { label: 'Scout AO', href: '/scout' },
  },
  {
    id: 'us-open-tennis-2026',
    label: 'US Open 2026',
    sublabel: 'Hard Court',
    icon: '🎾',
    tier: 2,
    theme: 'hard-tennis',
    sport: 'tennis',
    startDate: '2026-08-31',
    endDate:   '2026-09-13',
    scoutPreset: {
      sport:   'tennis',
      context: 'US Open 2026 — late-season hard court form, night-session patterns, fifth-set specialists.',
    },
    dashboardCta: { label: 'Scout US Open', href: '/scout' },
  },
  {
    id: 'ucl-final-2026',
    label: 'Champions League Final',
    sublabel: 'Munich',
    icon: '⭐',
    tier: 2,
    theme: 'football',
    sport: 'soccer',
    startDate: '2026-05-30',
    endDate:   '2026-05-30',
    scoutPreset: {
      sport:   'soccer',
      context: 'UEFA Champions League Final — neutral venue, tactical shape, set piece specialists, European H2H.',
    },
    dashboardCta: { label: 'Scout UCL Final', href: '/scout' },
  },
  {
    id: 'super-bowl-lx',
    label: 'Super Bowl LX',
    sublabel: 'New Orleans',
    icon: '🏈',
    tier: 2,
    theme: 'american-football',
    sport: 'other',
    startDate: '2026-02-01',
    endDate:   '2026-02-01',
    scoutPreset: {
      sport:   'other',
      context: 'Super Bowl LX — game script, weather, offensive line matchup, and prop bet research.',
    },
    dashboardCta: { label: 'Scout Super Bowl', href: '/scout' },
  },
  {
    id: 'nba-finals-2026',
    label: 'NBA Finals 2026',
    icon: '🏀',
    tier: 2,
    theme: 'basketball',
    sport: 'basketball',
    startDate: '2026-06-04',
    endDate:   '2026-06-21',
    scoutPreset: {
      sport:   'basketball',
      context: 'NBA Finals 2026 — home court edge, fatigue after long series, key player impact, pace matchup.',
    },
    dashboardCta: { label: 'Scout NBA Finals', href: '/scout' },
  },
  {
    id: 'cs2-major-2026',
    label: 'CS2 Major 2026',
    icon: '🎯',
    tier: 2,
    theme: 'esports',
    sport: 'cs2',
    startDate: '2026-09-15',
    endDate:   '2026-09-28',
    scoutPreset: {
      sport:   'cs2',
      context: 'CS2 Major — map pool matchups, LAN vs online form, roster stability, bracket positioning.',
    },
    dashboardCta: { label: 'Scout CS2 Major', href: '/scout' },
  },

  // ── Tier 3: Light Pulse ──────────────────────────────────────
  {
    id: 'copa-america-2026',
    label: 'Copa América 2026',
    icon: '🏟️',
    tier: 3,
    theme: 'football',
    sport: 'soccer',
    startDate: '2026-06-27',
    endDate:   '2026-07-26',
    scoutPreset: {
      sport:   'soccer',
      context: 'Copa América 2026 — South American national team form, travel fatigue, tournament bracket pressure.',
    },
  },
  {
    id: 'tour-de-france-2026',
    label: 'Tour de France 2026',
    icon: '🚴',
    tier: 3,
    theme: 'neutral',
    sport: 'other',
    startDate: '2026-07-04',
    endDate:   '2026-07-27',
    scoutPreset: {
      sport:   'other',
      context: 'Tour de France 2026 — stage specialist vs GC matchups, mountain form, weather and road conditions.',
    },
  },
  {
    id: 'dota2-ti-2026',
    label: 'Dota 2 The International',
    icon: '🎮',
    tier: 3,
    theme: 'esports',
    sport: 'other',
    startDate: '2026-08-20',
    endDate:   '2026-08-31',
    scoutPreset: {
      sport:   'other',
      context: 'Dota 2 TI — draft tendencies, regional style matchups, upper/lower bracket pressure.',
    },
  },
  {
    id: 'lol-worlds-2026',
    label: 'LoL World Championship',
    icon: '🎮',
    tier: 3,
    theme: 'esports',
    sport: 'other',
    startDate: '2026-10-01',
    endDate:   '2026-11-05',
    scoutPreset: {
      sport:   'other',
      context: 'LoL Worlds 2026 — regional meta matchups, international H2H, group stage bracket pressure.',
    },
  },
  {
    id: 'mlb-ws-2026',
    label: 'MLB World Series 2026',
    icon: '⚾',
    tier: 3,
    theme: 'neutral',
    sport: 'other',
    startDate: '2026-10-20',
    endDate:   '2026-10-31',
    scoutPreset: {
      sport:   'other',
      context: 'MLB World Series 2026 — pitching matchups, home/away splits, weather, bullpen depth.',
    },
  },
]

// ─── Resolvers ────────────────────────────────────────────────
export function getActiveEvents(today: string): PulseEvent[] {
  return PULSE_EVENTS.filter(e => e.startDate <= today && today <= e.endDate)
}

export function getPrimaryEvent(today: string): PulseEvent | null {
  const active = getActiveEvents(today)
  if (!active.length) return null
  // Lowest tier wins; stable sort preserves config order within a tier
  return [...active].sort((a, b) => a.tier - b.tier)[0]
}

export function getSecondaryEvents(today: string): PulseEvent[] {
  const primary = getPrimaryEvent(today)
  if (!primary) return []
  return getActiveEvents(today).filter(e => e.id !== primary.id)
}

export function getActiveScoutPresets(today: string): Array<{
  id: string; label: string; icon: string; sport: string; context: string; tier: 1 | 2 | 3
}> {
  return getActiveEvents(today)
    .filter(e => e.scoutPreset)
    .map(e => ({
      id:      e.id,
      label:   e.label,
      icon:    e.icon,
      sport:   e.scoutPreset!.sport,
      context: e.scoutPreset!.context,
      tier:    e.tier,
    }))
}
