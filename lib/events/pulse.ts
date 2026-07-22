export type PulseTheme =
  | 'default'
  | 'football_global'
  | 'grass_major'
  | 'clay_major'
  | 'hardcourt_major'
  | 'carbon_race'
  | 'hardwood_finals'
  | 'gridiron_final'
  | 'hockey'
  | 'esports'

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

// ─── Static event registry ────────────────────────────────────
const PULSE_EVENTS: PulseEvent[] = [
  // ── Tier 1: Global Pulse ─────────────────────────────────────
  {
    id: 'fifa-wc-2026',
    label: 'FIFA World Cup 2026',
    sublabel: 'USA · Canada · Mexico',
    icon: '🏆',
    tier: 1,
    theme: 'football_global',
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
    theme: 'grass_major',
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
    theme: 'clay_major',
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
    theme: 'hardcourt_major',
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
    theme: 'hardcourt_major',
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
    theme: 'football_global',
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
    theme: 'gridiron_final',
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
    theme: 'hardwood_finals',
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
    theme: 'football_global',
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
    theme: 'default',
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
    theme: 'default',
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
