import type { PulseTheme } from './pulse'

export interface AmbientTokens {
  accent:      string
  accentSoft:  string
  accentGlow:  string
  bg:          string
  texture?:    string
  textureSize?: string
}

// Maps event.theme → ambient CSS variable values.
// No event registry logic — that lives in pulse.ts.
export const AMBIENT_THEMES: Record<PulseTheme, AmbientTokens> = {
  default: {
    accent:      '#F5A623',
    accentSoft:  'rgba(245,166,35,0.12)',
    accentGlow:  'rgba(245,166,35,0.15)',
    bg:          '#0A0A0A',
  },
  football_global: {
    accent:      '#2ECC71',
    accentSoft:  'rgba(46,204,113,0.12)',
    accentGlow:  'rgba(46,204,113,0.18)',
    bg:          '#060D08',
    texture:     'repeating-linear-gradient(180deg, rgba(46,204,113,0.03) 0px, rgba(46,204,113,0.03) 1px, transparent 1px, transparent 24px)',
    textureSize: 'auto',
  },
  grass_major: {
    accent:      '#7C3AED',
    accentSoft:  'rgba(124,58,237,0.12)',
    accentGlow:  'rgba(124,58,237,0.18)',
    bg:          '#06080D',
    texture:     'repeating-linear-gradient(0deg, rgba(124,58,237,0.04) 0px, rgba(124,58,237,0.04) 1px, transparent 1px, transparent 16px), repeating-linear-gradient(90deg, rgba(124,58,237,0.04) 0px, rgba(124,58,237,0.04) 1px, transparent 1px, transparent 16px)',
    textureSize: '16px 16px',
  },
  clay_major: {
    accent:      '#C1440E',
    accentSoft:  'rgba(193,68,14,0.12)',
    accentGlow:  'rgba(193,68,14,0.18)',
    bg:          '#0D0806',
    texture:     'radial-gradient(circle, rgba(193,68,14,0.04) 1px, transparent 1px)',
    textureSize: '12px 12px',
  },
  hardcourt_major: {
    accent:      '#0055A4',
    accentSoft:  'rgba(0,85,164,0.15)',
    accentGlow:  'rgba(0,85,164,0.2)',
    bg:          '#06080D',
  },
  carbon_race: {
    accent:      '#E10600',
    accentSoft:  'rgba(225,6,0,0.12)',
    accentGlow:  'rgba(225,6,0,0.18)',
    bg:          '#0D0606',
    texture:     'repeating-linear-gradient(45deg, rgba(225,6,0,0.035) 0px, rgba(225,6,0,0.035) 1px, transparent 1px, transparent 8px), repeating-linear-gradient(-45deg, rgba(225,6,0,0.035) 0px, rgba(225,6,0,0.035) 1px, transparent 1px, transparent 8px)',
    textureSize: '8px 8px',
  },
  hardwood_finals: {
    accent:      '#F97316',
    accentSoft:  'rgba(249,115,22,0.12)',
    accentGlow:  'rgba(249,115,22,0.18)',
    bg:          '#0D0A06',
    texture:     'repeating-linear-gradient(90deg, rgba(249,115,22,0.025) 0px, rgba(249,115,22,0.025) 1px, transparent 1px, transparent 40px)',
    textureSize: 'auto',
  },
  gridiron_final: {
    accent:      '#B91C1C',
    accentSoft:  'rgba(185,28,28,0.12)',
    accentGlow:  'rgba(185,28,28,0.18)',
    bg:          '#0D0606',
  },
  // Legacy / fallback themes — map to default gold
  hockey: {
    accent:      '#F5A623',
    accentSoft:  'rgba(245,166,35,0.12)',
    accentGlow:  'rgba(245,166,35,0.15)',
    bg:          '#0A0A0A',
  },
  esports: {
    accent:      '#F5A623',
    accentSoft:  'rgba(245,166,35,0.12)',
    accentGlow:  'rgba(245,166,35,0.15)',
    bg:          '#0A0A0A',
  },
}

export function getAmbientTheme(theme: string): AmbientTokens {
  return AMBIENT_THEMES[theme as PulseTheme] ?? AMBIENT_THEMES.default
}
