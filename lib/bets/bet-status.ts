// Canonical bet-status presentation resolver (Decision #058, resolves G12).
//
// Every surface that renders a bet status must resolve the label (and its
// style key) through this module. Unknown values resolve to an explicit
// 'unknown' key — never to Void or any other real settlement outcome.
//
// push / cashed_out / partial are presentation-only: they can be displayed
// but carry NO approved payout or settlement semantics (Decision #057 G1).

export const KNOWN_BET_STATUSES = [
  'pending',
  'won',
  'lost',
  'void',
  'push',
  'cashed_out',
  'partial',
] as const

export type KnownBetStatus = (typeof KNOWN_BET_STATUSES)[number]
export type BetStatusKey = KnownBetStatus | 'unknown'

export const BET_STATUS_LABELS: Record<BetStatusKey, string> = {
  pending: 'Pending',
  won: 'Won',
  lost: 'Lost',
  void: 'Void',
  push: 'Push',
  cashed_out: 'Cashed out',
  partial: 'Partial',
  unknown: 'Unknown',
}

export interface ResolvedBetStatus {
  key: BetStatusKey
  label: string
}

export function resolveBetStatus(status: string): ResolvedBetStatus {
  const key: BetStatusKey = (KNOWN_BET_STATUSES as readonly string[]).includes(status)
    ? (status as KnownBetStatus)
    : 'unknown'
  return { key, label: BET_STATUS_LABELS[key] }
}
