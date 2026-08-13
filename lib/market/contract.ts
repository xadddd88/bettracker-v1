// R18 market foundation — pure, versioned contract values only.
//
// This module does not read environment variables, sessions, or persistence. It is
// safe to share with deterministic server tests, but it grants no runtime authority:
// the only policy evaluator lives in server-policy.ts and the first profile remains
// configured (not enabled) until a separate legal/market activation gate is approved.

export const MARKET_PROFILE_STATUSES = [
  'configured',
  'enabled',
  'suspended',
  'retired',
] as const

export type MarketProfileStatus = (typeof MARKET_PROFILE_STATUSES)[number]

export const MARKET_ELIGIBILITY_STATUSES = [
  'eligible',
  'verification_required',
  'verification_pending',
  'travel_limited',
  'unsupported',
  'blocked',
  'signal_conflict',
  'legal_terms_update_required',
] as const

export type MarketEligibilityStatus = (typeof MARKET_ELIGIBILITY_STATUSES)[number]

export const MARKET_ELIGIBILITY_REASONS = [
  'eligible',
  'unknown_market_profile',
  'market_not_enabled',
  'policy_blocked',
  'policy_state_unavailable',
  'residence_verification_required',
  'northern_ireland_not_in_profile',
  'unsupported_residence',
  'market_signal_conflict',
  'market_signals_unresolved',
  'current_location_required',
  'travel_outside_profile',
  'legal_terms_update_required',
  'legal_terms_status_required',
  'verification_pending',
  'verification_required',
] as const

export type MarketEligibilityReason = (typeof MARKET_ELIGIBILITY_REASONS)[number]

export const GB_EW_SC_ELIGIBLE_TERRITORIES = [
  'england',
  'wales',
  'scotland',
] as const

export type GbEwScEligibleTerritory = (typeof GB_EW_SC_ELIGIBLE_TERRITORIES)[number]

export interface MarketProfile {
  readonly id: string
  readonly version: string
  readonly status: MarketProfileStatus
  readonly storefrontCountry: string
  readonly eligibleTerritories: readonly GbEwScEligibleTerritory[]
  readonly minimumAge: number
}

/**
 * Repository contract for the first R18 profile. `configured` is deliberate: adding
 * this object cannot enable a market, route, feature, or user. Runtime activation also
 * requires the independent, server-only flag and the later legal/market gate.
 */
export const GB_EW_SC_MARKET_PROFILE = Object.freeze({
  id: 'GB_EW_SC',
  version: 'GB_EW_SC_PROFILE_V1',
  status: 'configured',
  storefrontCountry: 'GB',
  eligibleTerritories: Object.freeze([...GB_EW_SC_ELIGIBLE_TERRITORIES]),
  minimumAge: 18,
} as const satisfies MarketProfile)

const GB_EW_SC_ELIGIBLE_TERRITORY_SET = new Set<string>(GB_EW_SC_ELIGIBLE_TERRITORIES)

export function isGbEwScEligibleTerritory(value: unknown): value is GbEwScEligibleTerritory {
  return typeof value === 'string' && GB_EW_SC_ELIGIBLE_TERRITORY_SET.has(value)
}

/** Only one R18 status grants market access. All unknown values fail closed. */
export function marketEligibilityGrantsAccess(status: unknown): status is 'eligible' {
  return status === 'eligible'
}
