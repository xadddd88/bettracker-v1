// R18 PR3B — server-owned, fail-closed MarketProfile eligibility policy.
//
// `node:process` is intentional: this module is a server boundary and must never be
// imported by a Client Component. No route or UI imports it in PR3B. The policy is
// repository-only until later schema, RLS, legal, onboarding, and activation gates.

import { env } from 'node:process'

import {
  GB_EW_SC_MARKET_PROFILE,
  isGbEwScEligibleTerritory,
  marketEligibilityGrantsAccess,
  type MarketEligibilityStatus,
} from './contract'

export const MARKET_PROFILE_GB_EW_SC_ENABLED_ENV = 'MARKET_PROFILE_GB_EW_SC_ENABLED'
export const GB_EW_SC_POLICY_VERSION = 'GB_EW_SC_POLICY_V1'

export type VerificationState = 'required' | 'pending' | 'verified'
export type MarketSignalAssessment = 'consistent' | 'conflict' | 'unresolved'
export type LegalTermsState = 'current' | 'update_required' | 'unknown'

export type MarketEligibilityReason =
  | 'eligible'
  | 'unknown_market_profile'
  | 'market_not_enabled'
  | 'policy_blocked'
  | 'policy_state_unavailable'
  | 'residence_verification_required'
  | 'northern_ireland_not_in_profile'
  | 'unsupported_residence'
  | 'market_signal_conflict'
  | 'market_signals_unresolved'
  | 'current_location_required'
  | 'travel_outside_profile'
  | 'legal_terms_update_required'
  | 'legal_terms_status_required'
  | 'verification_pending'
  | 'verification_required'

/**
 * Inputs are already-collected server evidence classes, not client assertions.
 * `storefrontCountry` is deliberately non-authoritative: GB alone never grants access.
 * Locale, display currency, timezone, and odds format are absent by design.
 */
export interface MarketEligibilityPolicyInput {
  readonly marketProfileId: unknown
  readonly residenceTerritory: unknown
  readonly currentTerritory: unknown
  readonly storefrontCountry?: unknown
  readonly verificationState: unknown
  readonly signalAssessment: unknown
  readonly legalTermsState: unknown
  readonly policyBlocked: unknown
}

export interface MarketEligibilityDecision {
  readonly marketProfileId: typeof GB_EW_SC_MARKET_PROFILE.id
  readonly policyVersion: typeof GB_EW_SC_POLICY_VERSION
  readonly status: MarketEligibilityStatus
  readonly reason: MarketEligibilityReason
  readonly grantsAccess: boolean
}

export type EligibilityRecheckAuthority = 'routine_recheck' | 'server_policy'

export interface EligibilityRecheckResult {
  readonly decision: MarketEligibilityDecision
  readonly outcome: 'applied' | 'unchanged' | 'elevation_rejected'
}

function decision(
  status: MarketEligibilityStatus,
  reason: MarketEligibilityReason,
): MarketEligibilityDecision {
  return Object.freeze({
    marketProfileId: GB_EW_SC_MARKET_PROFILE.id,
    policyVersion: GB_EW_SC_POLICY_VERSION,
    status,
    reason,
    grantsAccess: marketEligibilityGrantsAccess(status),
  })
}

function asEvidenceRecord(input: MarketEligibilityPolicyInput): Record<string, unknown> {
  return input !== null && typeof input === 'object'
    ? input as unknown as Record<string, unknown>
    : {}
}

function isMissingEvidence(value: unknown): boolean {
  return value === null || value === undefined || value === ''
}

/**
 * Exact server-only activation flag. Missing, empty, case variants, numbers, booleans,
 * and whitespace-padded strings all stay disabled.
 */
export function isGbEwScMarketProfileEnabled(
  rawValue: unknown = env[MARKET_PROFILE_GB_EW_SC_ENABLED_ENV],
): boolean {
  return rawValue === 'true'
}

/**
 * Evaluate the first market from server evidence. Evaluation never writes, calls a
 * provider, or reads a database. The disabled flag is checked before user evidence so
 * the repository contract cannot accidentally expose eligibility in production.
 */
export function evaluateMarketEligibility(
  input: MarketEligibilityPolicyInput,
): MarketEligibilityDecision {
  const evidence = asEvidenceRecord(input)

  if (evidence.marketProfileId !== GB_EW_SC_MARKET_PROFILE.id) {
    return decision('unsupported', 'unknown_market_profile')
  }

  if (!isGbEwScMarketProfileEnabled()) {
    return decision('blocked', 'market_not_enabled')
  }

  if (evidence.policyBlocked !== false) {
    return decision(
      'blocked',
      evidence.policyBlocked === true ? 'policy_blocked' : 'policy_state_unavailable',
    )
  }

  if (evidence.residenceTerritory === 'northern_ireland') {
    return decision('unsupported', 'northern_ireland_not_in_profile')
  }

  if (!isGbEwScEligibleTerritory(evidence.residenceTerritory)) {
    return isMissingEvidence(evidence.residenceTerritory)
      ? decision('verification_required', 'residence_verification_required')
      : decision('unsupported', 'unsupported_residence')
  }

  // Storefront is one signal, never proof. A conflicting explicit country closes the
  // gate; missing storefront evidence may be resolved by other server evidence.
  if (!isMissingEvidence(evidence.storefrontCountry) && evidence.storefrontCountry !== 'GB') {
    return decision('signal_conflict', 'market_signal_conflict')
  }

  if (evidence.signalAssessment === 'conflict') {
    return decision('signal_conflict', 'market_signal_conflict')
  }

  if (evidence.signalAssessment !== 'consistent') {
    return decision('verification_required', 'market_signals_unresolved')
  }

  if (!isGbEwScEligibleTerritory(evidence.currentTerritory)) {
    return isMissingEvidence(evidence.currentTerritory)
      ? decision('verification_required', 'current_location_required')
      : decision('travel_limited', 'travel_outside_profile')
  }

  if (evidence.legalTermsState === 'update_required') {
    return decision('legal_terms_update_required', 'legal_terms_update_required')
  }

  if (evidence.legalTermsState !== 'current') {
    return decision('verification_required', 'legal_terms_status_required')
  }

  if (evidence.verificationState === 'pending') {
    return decision('verification_pending', 'verification_pending')
  }

  if (evidence.verificationState !== 'verified') {
    return decision('verification_required', 'verification_required')
  }

  return decision('eligible', 'eligible')
}

/**
 * Routine rechecks may preserve or remove access, but cannot turn a denied decision into
 * `eligible`. That elevation requires the explicit server-policy authority path.
 */
export function applyEligibilityRecheck(
  current: MarketEligibilityDecision,
  proposed: MarketEligibilityDecision,
  authority: EligibilityRecheckAuthority,
): EligibilityRecheckResult {
  const attemptsElevation = !current.grantsAccess && proposed.grantsAccess

  if (attemptsElevation && authority !== 'server_policy') {
    return Object.freeze({ decision: current, outcome: 'elevation_rejected' })
  }

  const unchanged = current.status === proposed.status && current.reason === proposed.reason
  return Object.freeze({ decision: proposed, outcome: unchanged ? 'unchanged' : 'applied' })
}
