import type { PulseTheme } from './pulse'

export interface AmbientTokens {
  accent:       string
  accentSoft:   string
  accentGlow:   string
  accentRail:   string    // thin left-rail color for active nav
  bg:           string
  surface1?:    string    // event-aware card surface override
  surface2?:    string
  bodyOverlay?: string    // layered radial gradients for atmospheric depth
  texture?:     string
  textureSize?: string
}

// Maps event.theme → ambient CSS variable values.
// No event registry logic — that lives in pulse.ts.
export const AMBIENT_THEMES: Record<PulseTheme, AmbientTokens> = {
  default: {
    accent:     '#F5A623',
    accentSoft: 'rgba(245,166,35,0.10)',
    accentGlow: 'rgba(245,166,35,0.15)',
    accentRail: 'rgba(245,166,35,0.85)',
    bg:         '#0A0A0A',
  },
  football_global: {
    accent:     '#22C55E',
    accentSoft: 'rgba(34,197,94,0.09)',
    accentGlow: 'rgba(34,197,94,0.14)',
    accentRail: 'rgba(34,197,94,0.85)',
    bg:         '#060A07',
    surface1:   '#0A0F0B',
    surface2:   '#0D160E',
    // Stadium: overhead floodlight crown + corner fill lights
    bodyOverlay: [
      'radial-gradient(ellipse 80% 40% at 50% -5%, rgba(20,90,40,0.42) 0%, transparent 100%)',
      'radial-gradient(ellipse 50% 50% at 10% 100%, rgba(14,70,30,0.14) 0%, transparent 100%)',
      'radial-gradient(ellipse 50% 50% at 90% 100%, rgba(14,70,30,0.14) 0%, transparent 100%)',
    ].join(', '),
    texture:     'linear-gradient(rgba(255,255,255,0.017) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.017) 1px, transparent 1px)',
    textureSize: '72px 72px',
  },
  grass_major: {
    accent:     '#A78BFA',
    accentSoft: 'rgba(167,139,250,0.10)',
    accentGlow: 'rgba(167,139,250,0.16)',
    accentRail: 'rgba(167,139,250,0.85)',
    bg:         '#07060E',
    surface1:   '#0B0A14',
    bodyOverlay: 'radial-gradient(ellipse 70% 35% at 50% -5%, rgba(80,50,180,0.28) 0%, transparent 100%)',
    texture:     'repeating-linear-gradient(-45deg, rgba(167,139,250,0.03) 0px, rgba(167,139,250,0.03) 1px, transparent 1px, transparent 10px)',
    textureSize: '14px 14px',
  },
  clay_major: {
    accent:     '#F97316',
    accentSoft: 'rgba(249,115,22,0.10)',
    accentGlow: 'rgba(249,115,22,0.16)',
    accentRail: 'rgba(249,115,22,0.85)',
    bg:         '#0D0804',
    surface1:   '#130D07',
    bodyOverlay: 'radial-gradient(ellipse 70% 35% at 50% -5%, rgba(160,60,10,0.32) 0%, transparent 100%)',
    texture:     'radial-gradient(circle, rgba(193,68,14,0.04) 1px, transparent 1px)',
    textureSize: '14px 14px',
  },
  hardcourt_major: {
    accent:     '#60A5FA',
    accentSoft: 'rgba(96,165,250,0.10)',
    accentGlow: 'rgba(96,165,250,0.16)',
    accentRail: 'rgba(96,165,250,0.85)',
    bg:         '#050810',
    surface1:   '#080C18',
    bodyOverlay: 'radial-gradient(ellipse 70% 35% at 50% -5%, rgba(20,50,120,0.32) 0%, transparent 100%)',
  },
  carbon_race: {
    accent:     '#F87171',
    accentSoft: 'rgba(248,113,113,0.10)',
    accentGlow: 'rgba(248,113,113,0.16)',
    accentRail: 'rgba(248,113,113,0.85)',
    bg:         '#0A0404',
    surface1:   '#120808',
    bodyOverlay: 'radial-gradient(ellipse 70% 35% at 50% -5%, rgba(160,10,10,0.35) 0%, transparent 100%)',
    texture:     'repeating-linear-gradient(45deg, rgba(225,6,0,0.03) 0px, rgba(225,6,0,0.03) 1px, transparent 1px, transparent 8px), repeating-linear-gradient(-45deg, rgba(225,6,0,0.03) 0px, rgba(225,6,0,0.03) 1px, transparent 1px, transparent 8px)',
    textureSize: '8px 8px',
  },
  hardwood_finals: {
    accent:     '#FB923C',
    accentSoft: 'rgba(251,146,60,0.10)',
    accentGlow: 'rgba(251,146,60,0.16)',
    accentRail: 'rgba(251,146,60,0.85)',
    bg:         '#0B0805',
    surface1:   '#130E07',
    bodyOverlay: 'radial-gradient(ellipse 70% 35% at 50% -5%, rgba(160,80,10,0.30) 0%, transparent 100%)',
    texture:     'repeating-linear-gradient(90deg, rgba(249,115,22,0.025) 0px, rgba(249,115,22,0.025) 1px, transparent 1px, transparent 44px)',
    textureSize: 'auto',
  },
  gridiron_final: {
    accent:     '#F87171',
    accentSoft: 'rgba(248,113,113,0.10)',
    accentGlow: 'rgba(248,113,113,0.16)',
    accentRail: 'rgba(248,113,113,0.85)',
    bg:         '#0A0404',
    surface1:   '#120808',
    bodyOverlay: 'radial-gradient(ellipse 70% 35% at 50% -5%, rgba(150,15,15,0.35) 0%, transparent 100%)',
  },
  hockey: {
    accent:     '#F5A623',
    accentSoft: 'rgba(245,166,35,0.10)',
    accentGlow: 'rgba(245,166,35,0.15)',
    accentRail: 'rgba(245,166,35,0.85)',
    bg:         '#0A0A0A',
  },
  esports: {
    accent:     '#A78BFA',
    accentSoft: 'rgba(167,139,250,0.10)',
    accentGlow: 'rgba(167,139,250,0.16)',
    accentRail: 'rgba(167,139,250,0.85)',
    bg:         '#06050E',
    surface1:   '#0A0912',
    bodyOverlay: 'radial-gradient(ellipse 70% 35% at 50% -5%, rgba(80,40,180,0.28) 0%, transparent 100%)',
  },
}

export function getAmbientTheme(theme: string): AmbientTokens {
  return AMBIENT_THEMES[theme as PulseTheme] ?? AMBIENT_THEMES.default
}
