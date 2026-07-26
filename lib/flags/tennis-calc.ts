// Tennis Live Series Calculator — access gate (flag + private allowlist) ONLY.
//
// Server-only module. It is NOT wired to any feature surface yet: nothing in the
// running product imports it, so production runtime behaviour is unchanged by PR-2.
//
// Two independent gates, both FAIL-CLOSED:
//   1. TENNIS_CALC_ENABLED  — server-only feature flag, default OFF. Access is granted
//      only on the exact literal string 'true'. Missing / empty / 'TRUE' / '1' / 'yes' /
//      ' true ' all deny. This matches the repository's existing write-gate convention
//      (`process.env.SPORTS_FIXTURE_SYNC_WRITE_ENABLED === 'true'` in
//      lib/providers/fixture-sync.ts, `SPORTS_PROVIDER_LINK_WRITE_ENABLED` in
//      lib/providers/sportmonks-provider-link-write.ts) rather than inventing a
//      second flag system.
//   2. OWNER_USER_ID / TENNIS_CALC_ALLOWED_USER_IDS — server-only allowlists. The owner
//      id remains supported for the founder, while the optional tester list accepts
//      comma-separated UUIDs. Missing or malformed config closes the gate for callers
//      not present in a valid entry. No profiles/role column, no migration, no Supabase
//      read: the caller passes the already-authenticated user id in.
//
// SECRET DISCIPLINE: neither env value is ever logged, thrown, formatted, or returned.
// The result carries a typed reason enum only — never an id, never an env value. There
// are deliberately no console/log calls and no getter that returns OWNER_USER_ID.
//
// CLIENT EXPOSURE: both names are intentionally un-prefixed. Next.js only inlines
// `NEXT_PUBLIC_*` into client bundles, so a NEXT_PUBLIC_TENNIS_CALC_ENABLED flag is
// forbidden and asserted against in scripts/test-tennis-access-gate.mjs.

import { z } from 'zod'
import { timingSafeEqual } from 'node:crypto'

/** Canonical env var names, exported for tests/runbooks (names only, never values). */
export const TENNIS_CALC_FLAG_ENV = 'TENNIS_CALC_ENABLED'
export const TENNIS_CALC_OWNER_ENV = 'OWNER_USER_ID'
export const TENNIS_CALC_ALLOWED_USERS_ENV = 'TENNIS_CALC_ALLOWED_USER_IDS'

/** The only value that opens the feature flag. Any other value denies. */
const FLAG_ENABLED_VALUE = 'true'

/** Typed, safe denial reasons. Safe to surface to a caller: they leak no env values. */
export type TennisCalcDenialReason =
  | 'feature_disabled'
  | 'owner_not_configured'
  | 'unauthenticated'
  | 'not_owner'

/** Discriminated result, mirroring LimitResult in lib/tennis/series-math.ts. */
export type TennisCalcAccessResult =
  | { allowed: true }
  | { allowed: false; reason: TennisCalcDenialReason }

const uuidSchema = z.string().uuid()

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && uuidSchema.safeParse(value).success
}

/**
 * Server-only feature flag state. Read at call time (not cached at module load) so the
 * gate reflects the current environment, matching the repo's inline `=== 'true'` gates.
 */
export function isTennisCalcEnabled(): boolean {
  return process.env[TENNIS_CALC_FLAG_ENV] === FLAG_ENABLED_VALUE
}

/**
 * Resolve the configured owner id. Private on purpose: nothing outside this module may
 * obtain the OWNER_USER_ID value. Returns null when unset or malformed (fail-closed).
 */
function configuredOwnerId(): string | null {
  const raw = process.env[TENNIS_CALC_OWNER_ENV]
  return isUuid(raw) ? raw : null
}

function configuredAllowedUserIds(): string[] {
  const raw = process.env[TENNIS_CALC_ALLOWED_USERS_ENV]
  if (typeof raw !== 'string') return []
  return raw
    .split(',')
    .map(part => part.trim())
    .filter(isUuid)
}

/** Constant-time equality, mirroring safeEqual() in the admin sync routes. */
function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}

/**
 * Fail-closed access gate for the Tennis Live Series Calculator.
 *
 * @param userId the ALREADY-AUTHENTICATED user id, supplied by the caller. This module
 *   performs no Supabase read and no session lookup of its own; pass null/undefined for
 *   an unauthenticated request.
 *
 * Check order is deliberate: the flag is evaluated FIRST, so while the feature is off the
 * result is identical for every caller and reveals nothing about whether an owner is
 * configured or who it is. A disabled flag therefore blocks even the correct owner.
 * The identity comparison is exact (case-sensitive) per the owner-gate decision.
 */
export function checkTennisCalcAccess(userId: string | null | undefined): TennisCalcAccessResult {
  if (!isTennisCalcEnabled()) return { allowed: false, reason: 'feature_disabled' }

  const ownerId = configuredOwnerId()
  const allowedUserIds = configuredAllowedUserIds()
  if (ownerId === null && allowedUserIds.length === 0) {
    return { allowed: false, reason: 'owner_not_configured' }
  }

  // A real authenticated user always carries a UUID; anything else is not authenticated.
  if (!isUuid(userId)) return { allowed: false, reason: 'unauthenticated' }

  if (ownerId !== null && safeEqual(userId, ownerId)) return { allowed: true }
  if (allowedUserIds.some(allowedUserId => safeEqual(userId, allowedUserId))) {
    return { allowed: true }
  }

  return { allowed: false, reason: 'not_owner' }
}
