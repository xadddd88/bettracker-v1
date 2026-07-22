// Broadcast Noir v3.1 semantic adapter.
// Canonical values live in /design-system/broadcast-noir.v3.1.json.
// scripts/test-broadcast-noir-design-system.mjs prevents Web/mobile drift.
export const semanticColors = {
  night: '#070A08',
  field: '#111813',
  fieldRaised: '#202C23',
  borderSubtle: '#334036',
  borderStrong: '#59685E',
  textPrimary: '#F2F5F0',
  textMuted: '#8D978F',
  textQuiet: '#78847B',
  textQuietRaised: '#8D978F',
  dataValue: '#C7D0C8',
  signal: '#BFFF3B',
  onSignal: '#061008',
  success: '#67DF91',
  negative: '#FF7474',
  review: '#FFC05B',
} as const;

export const typography = {
  heroMobile: { fontSize: 34, lineHeight: 38 },
  heroTablet: { fontSize: 44, lineHeight: 48 },
  heroDesktop: { fontSize: 56, lineHeight: 60 },
  pageTitleMobile: { fontSize: 28, lineHeight: 34 },
  pageTitleDesktop: { fontSize: 36, lineHeight: 42 },
  sectionMobile: { fontSize: 20, lineHeight: 26 },
  sectionDesktop: { fontSize: 24, lineHeight: 30 },
  bodyMobile: { fontSize: 14, lineHeight: 21 },
  bodyDesktop: { fontSize: 15, lineHeight: 23 },
  metadataCompact: { fontSize: 11, lineHeight: 16 },
  metadataPreferred: { fontSize: 12, lineHeight: 17 },
} as const;

export const geometry = {
  radiusControl: 8,
  webTouchMinimum: 44,
  iosTouchMinimum: 44,
  androidTouchMinimum: 48,
} as const;

export const motion = {
  pressMinimumMs: 80,
  pressMaximumMs: 120,
  hoverMinimumMs: 160,
  hoverMaximumMs: 180,
  routeMinimumMs: 220,
  routeMaximumMs: 280,
  sweepMinimumMs: 280,
  sweepMaximumMs: 360,
  successMaximumMs: 800,
  infiniteDecorativeLoops: false,
} as const;
