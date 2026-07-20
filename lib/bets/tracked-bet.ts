import { z } from 'zod'

// ─────────────────────────────────────────────────────────────
// Decision #060 Phase B — shared contract for the tracked-bet
// write path (Scanner → editable legs → POST /api/bets →
// create_tracked_bet RPC).
//
// One zod shape backs BOTH the client form and the API route, so
// the strict mirror of the migration-024 contract cannot drift
// between the two. The RPC remains the financial authority; this
// module only rejects obviously-invalid payloads before the
// database is consulted.
// ─────────────────────────────────────────────────────────────

export const TRACKED_BET_SPORTS = ['soccer', 'tennis', 'basketball', 'ice_hockey', 'cs2', 'mma', 'other'] as const
export type TrackedBetSport = (typeof TRACKED_BET_SPORTS)[number]

export const MAX_TRACKED_BET_LEGS = 20

// Strict mirror of the per-leg contract: ONLY the five allowed
// keys; unknown keys fail closed, exactly like the RPC.
export const trackedLegSchema = z.object({
  sport:       z.enum(TRACKED_BET_SPORTS),
  event_name:  z.string().trim().min(1, 'Event name is required').max(200, 'Event name too long'),
  market_type: z.string().trim().min(1, 'Market is required').max(100, 'Market too long'),
  selection:   z.string().trim().max(200, 'Selection too long').nullable().optional(),
  odds:        z.number({ invalid_type_error: 'Leg odds must be a number' })
    .gt(1, 'Leg odds must be greater than 1')
    .max(10_000, 'Leg odds exceed limit'),
}).strict()

const trackedBetCoreShape = {
  legs: z.array(trackedLegSchema)
    .min(1, 'At least one leg is required')
    .max(MAX_TRACKED_BET_LEGS, `A bet can have at most ${MAX_TRACKED_BET_LEGS} legs`),
  total_odds: z.number({ invalid_type_error: 'Total odds must be a number' })
    .gt(1, 'Total odds must be greater than 1')
    .max(100_000_000, 'Total odds exceed limit')
    .nullable()
    .optional(),
  stake: z.number({ invalid_type_error: 'Stake must be a number' })
    .positive('Stake must be positive')
    .max(100_000_000, 'Stake exceeds limit'),
  bookmaker: z.string().trim().max(100, 'Bookmaker too long').nullable().optional(),
  notes:     z.string().trim().max(500, 'Notes too long').nullable().optional(),
  source:    z.enum(['manual', 'scanner']),
}

// Mirror of the RPC single/parlay derivation rules.
function refineDerivation(
  value: { legs: Array<{ odds: number }>; total_odds?: number | null },
  ctx: z.RefinementCtx
) {
  if (value.legs.length >= 2 && value.total_odds == null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['total_odds'],
      message: 'Total odds are required for an express bet',
    })
  }
  if (value.legs.length === 1 && value.total_odds != null && value.total_odds !== value.legs[0].odds) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['total_odds'],
      message: 'Total odds must match the single leg odds',
    })
  }
}

// Client-side form payload (the idempotency key is attached at
// submit time, after the payload snapshot is taken).
export const trackedBetFormSchema = z.object(trackedBetCoreShape).strict().superRefine(refineDerivation)

// Full API request payload.
export const trackedBetRequestSchema = z.object({
  ...trackedBetCoreShape,
  idempotency_key: z.string().uuid('Idempotency key must be a UUID'),
}).strict().superRefine(refineDerivation)

export type TrackedLegInput = z.infer<typeof trackedLegSchema>
export type TrackedBetForm = z.infer<typeof trackedBetFormSchema>
export type TrackedBetRequest = z.infer<typeof trackedBetRequestSchema>

// ─────────────────────────────────────────────────────────────
// Submit-intent state machine (pure, deterministic).
//
// One INTENT = one payload fingerprint bound to one idempotency
// UUID. The lifecycle is a pure function of (state, event), the
// UUID generator is injected, and no I/O happens here — so the
// exact double-submit / retry / conflict semantics are unit-tested
// directly. The form is a thin wire around these transitions:
//
//   ready ──beginSubmit(fingerprint)──▶ in_flight
//     · same fingerprint as the stored snapshot → SAME UUID
//       (exact retry replays server-side, no second deduction)
//     · new fingerprint → fresh UUID
//   in_flight ──beginSubmit──▶ blocked (double click; no new UUID)
//   in_flight ──resolve('success')──▶ ready, intent CLEARED
//     (the next submit is a new intent with a new UUID)
//   in_flight ──resolve('retryable')──▶ ready, UUID + snapshot KEPT
//     (network error / 429 / 503 / 5xx / validation — exact retry
//      reuses the same key)
//   in_flight ──resolve('conflict')──▶ conflict, UUID + snapshot KEPT
//     (409: NEVER rotate the key, NEVER auto-retry)
//   conflict ──beginSubmit(same fingerprint)──▶ blocked
//     (no fetch, no new UUID — a fresh key on an ambiguous conflict
//      could create a second bet)
//   conflict ──beginSubmit(new fingerprint)──▶ in_flight
//     (a deliberate payload change is a NEW intent → fresh UUID)
// ─────────────────────────────────────────────────────────────

export type IntentStatus = 'ready' | 'in_flight' | 'conflict'

export interface SubmitIntent {
  status:      IntentStatus
  fingerprint: string | null
  key:         string | null
}

export type UuidGenerator = () => string

export type SubmitOutcome = 'success' | 'conflict' | 'retryable'

export type BeginSubmitResult =
  | { ok: true; key: string; intent: SubmitIntent }
  | { ok: false; reason: 'in_flight' | 'conflict_unchanged'; intent: SubmitIntent }

export function createSubmitIntent(): SubmitIntent {
  return { status: 'ready', fingerprint: null, key: null }
}

// Canonical payload snapshot the UUID is bound to.
export function fingerprintPayload(payload: unknown): string {
  return JSON.stringify(payload)
}

export function beginSubmit(
  intent: SubmitIntent,
  fingerprint: string,
  generateUuid: UuidGenerator
): BeginSubmitResult {
  if (intent.status === 'in_flight') {
    return { ok: false, reason: 'in_flight', intent }
  }

  if (intent.status === 'conflict') {
    if (intent.fingerprint === fingerprint) {
      // Locked: resubmitting the conflicted intent unchanged is
      // blocked with no network call and NO new UUID.
      return { ok: false, reason: 'conflict_unchanged', intent }
    }
    // Deliberate payload change → brand-new intent, fresh UUID.
    const key = generateUuid()
    return { ok: true, key, intent: { status: 'in_flight', fingerprint, key } }
  }

  // ready: reuse the key ONLY for the exact same snapshot.
  const key = intent.key != null && intent.fingerprint === fingerprint
    ? intent.key
    : generateUuid()
  return { ok: true, key, intent: { status: 'in_flight', fingerprint, key } }
}

export function resolveSubmit(intent: SubmitIntent, outcome: SubmitOutcome): SubmitIntent {
  switch (outcome) {
    case 'success':
      // Intent complete — the next submit is a new intent.
      return createSubmitIntent()
    case 'conflict':
      // KEEP the UUID and snapshot; lock the intent.
      return { ...intent, status: 'conflict' }
    case 'retryable':
      // KEEP the UUID and snapshot; an exact retry reuses both.
      return { ...intent, status: 'ready' }
  }
}

// ─────────────────────────────────────────────────────────────
// Editor drafts — string-typed controlled-input state. Array
// order IS the leg order (leg_index = position + 1 in the RPC).
// ─────────────────────────────────────────────────────────────

export interface LegDraft {
  sport:       TrackedBetSport
  event_name:  string
  market_type: string
  selection:   string
  odds:        string
}

export function emptyLegDraft(sport: TrackedBetSport = 'soccer'): LegDraft {
  return { sport, event_name: '', market_type: '', selection: '', odds: '' }
}

export type TrackedBetMode = 'single' | 'express'

// The Single / Express selector is an editor action, not a passive label.
// Switching to Express creates the required second editable leg; switching
// back to Single keeps the first leg and drops the rest only after the page
// has obtained the user's confirmation. Keeping this transition pure makes
// the exact draft-preservation behaviour regression-testable.
export function switchLegDraftMode(drafts: LegDraft[], mode: TrackedBetMode): LegDraft[] {
  const first = drafts[0] ?? emptyLegDraft()

  if (mode === 'single') return [first]
  if (drafts.length >= 2) return drafts

  return [first, emptyLegDraft(first.sport)]
}

// Build the request legs from drafts. Empty selection collapses to
// null (the RPC normalizes the same way); odds parse to numbers so
// the schema — not string coercion — decides validity.
export function draftsToRequestLegs(drafts: LegDraft[]): Array<{
  sport: TrackedBetSport
  event_name: string
  market_type: string
  selection: string | null
  odds: number
}> {
  return drafts.map(draft => ({
    sport:       draft.sport,
    event_name:  draft.event_name.trim(),
    market_type: draft.market_type.trim(),
    selection:   draft.selection.trim() === '' ? null : draft.selection.trim(),
    odds:        Number(draft.odds),
  }))
}

// UI PREVIEW ONLY: product of the entered leg odds. Returns null
// unless every leg has valid odds. Never used as the submitted
// value — the user-entered/coupon total is what the RPC receives,
// and the RPC stays the financial authority.
export function computeExpressPreviewTotal(drafts: LegDraft[]): number | null {
  if (drafts.length < 2) return null
  let product = 1
  for (const draft of drafts) {
    const odds = Number(draft.odds)
    if (!Number.isFinite(odds) || odds <= 1) return null
    product *= odds
  }
  return Math.round(product * 1000) / 1000
}

// ─────────────────────────────────────────────────────────────
// Scanner → drafts adapter (allowlist).
//
// The scanner response carries camelCase legs plus OCR/live noise
// (rawText, statusText, scoreText, isLive, periodOrPhase, …). ONLY
// the five contract fields are mapped here — nothing else can leak
// toward the API/RPC. A leg whose odds were unreadable keeps an
// EMPTY odds draft: the coupon total is never silently copied onto
// individual legs.
// ─────────────────────────────────────────────────────────────

interface ScannerLegLike {
  eventName?:  string | null
  marketType?: string | null
  selection?:  string | null
  odds?:       number | null
  sport?:      string | null
}

export interface ScannerDataLike {
  event_name?:  string | null
  market_type?: string | null
  selection?:   string | null
  odds?:        number | null
  stake?:       number | null
  bookmaker?:   string | null
  sport?:       string | null
  legs?:        ScannerLegLike[] | null
}

function canonicalSport(candidate: string | null | undefined, fallback: TrackedBetSport): TrackedBetSport {
  return (TRACKED_BET_SPORTS as readonly string[]).includes(candidate ?? '')
    ? (candidate as TrackedBetSport)
    : fallback
}

// Decision #061 Phase A1: the adapter is FAIL CLOSED. An oversized
// coupon is rejected wholesale as a discriminated union — never
// truncated, never partially imported. The caller must check `ok`
// BEFORE applying any field to form state.
export type ScannerDraftResult =
  | { ok: true; legs: LegDraft[]; totalOdds: string; stake: string; bookmaker: string }
  | { ok: false; reason: 'too_many_legs' }

export function scannerDataToDrafts(data: ScannerDataLike): ScannerDraftResult {
  // Checked on the RAW leg count, BEFORE any filter/slice/map: a
  // 21+-leg coupon must not shrink into an importable one through
  // empty-name filtering, and nothing may be silently dropped.
  if ((data.legs?.length ?? 0) > MAX_TRACKED_BET_LEGS) {
    return { ok: false, reason: 'too_many_legs' }
  }

  const fallbackSport = canonicalSport(data.sport, 'soccer')

  const scannedLegs = (data.legs ?? [])
    .filter(leg => (leg.eventName ?? '').trim() !== '')
    .map(leg => ({
      sport:       canonicalSport(leg.sport, fallbackSport),
      event_name:  (leg.eventName ?? '').trim(),
      market_type: (leg.marketType ?? '').trim(),
      selection:   (leg.selection ?? '').trim(),
      odds:        leg.odds != null && Number.isFinite(leg.odds) ? String(leg.odds) : '',
    }))

  if (scannedLegs.length > 0) {
    return {
      ok: true,
      legs: scannedLegs,
      // data.odds is the coupon TOTAL. For a single leg the leg's own
      // odds already carry it; only an express needs it as the
      // pre-filled (still editable) total.
      totalOdds: scannedLegs.length >= 2 && data.odds != null ? String(data.odds) : '',
      stake:     data.stake != null ? String(data.stake) : '',
      bookmaker: (data.bookmaker ?? '').trim(),
    }
  }

  // Legacy flattened fallback: one editable leg from the summary.
  return {
    ok: true,
    legs: [{
      sport:       fallbackSport,
      event_name:  (data.event_name ?? '').trim(),
      market_type: (data.market_type ?? '').trim(),
      selection:   (data.selection ?? '').trim(),
      odds:        data.odds != null && Number.isFinite(data.odds) ? String(data.odds) : '',
    }],
    totalOdds: '',
    stake:     data.stake != null ? String(data.stake) : '',
    bookmaker: (data.bookmaker ?? '').trim(),
  }
}
