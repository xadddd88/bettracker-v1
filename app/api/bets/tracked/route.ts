import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/supabase/request-auth'
import { enforceRateLimit, RATE_LIMITS } from '@/lib/rate-limit'
import { trackedBetRequestSchema } from '@/lib/bets/tracked-bet'

// Decision #060 Phase B — the ONLY write path for tracker entries.
// The route never touches bets / bet_legs / bankrolls /
// bankroll_transactions directly: one create_tracked_bet() RPC does
// leg validation, the bankroll row lock, the no-overdraft guard, and
// the atomic bet + legs + balance + stake-transaction write. The RPC
// runs as the AUTHENTICATED user (cookie session or verified native Bearer) — never
// service_role — so auth.uid() inside the function is the caller.

// Sanitized mapping for the RPC's deterministic validation RAISEs.
// No raw database error text ever reaches the client; anything
// unexpected is logged server-side and returned as a generic 500.
const RPC_VALIDATION_PATTERN =
  /legs must|leg \d+ |total_odds|stake must|stake exceeds|bookmaker too long|notes too long|unsupported source|invalid idempotency key/i

export async function POST(req: NextRequest) {
  const auth = await authenticateRequest(req)
  if (!auth.authorized) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { supabase, user } = auth

  const rateCheck = await enforceRateLimit(`tracked-bet:${user.id}`, RATE_LIMITS.trackedBet())
  if (rateCheck.unavailable) {
    return NextResponse.json({ error: 'Service temporarily unavailable. Try again shortly.' }, { status: 503 })
  }
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { error: 'Too many bets — please wait before trying again' },
      { status: 429, headers: { 'Retry-After': String(rateCheck.retryAfter || 60) } }
    )
  }

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = trackedBetRequestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
  }

  const { legs, total_odds, stake, bookmaker, notes, source, idempotency_key } = parsed.data

  // Exactly the five contract keys per leg — nothing from the scanner
  // (rawText / status / score / live phase) can ever reach the RPC.
  const legsPayload = legs.map(leg => ({
    sport:       leg.sport,
    event_name:  leg.event_name,
    market_type: leg.market_type,
    selection:   leg.selection ?? null,
    odds:        leg.odds,
  }))

  const { data, error } = await supabase.rpc('create_tracked_bet', {
    p_legs:            legsPayload,
    p_total_odds:      legs.length === 1 ? null : total_odds,
    p_stake:           stake,
    p_bookmaker:       bookmaker ?? null,
    p_notes:           notes ?? null,
    p_source:          source,
    p_idempotency_key: idempotency_key,
  })

  if (error) {
    if (/not authenticated/i.test(error.message)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (/insufficient balance/i.test(error.message)) {
      return NextResponse.json({ error: 'Insufficient balance' }, { status: 422 })
    }
    if (/no default bankroll/i.test(error.message)) {
      return NextResponse.json({ error: 'Bankroll not found' }, { status: 404 })
    }
    if (/idempotency conflict/i.test(error.message)) {
      return NextResponse.json({ error: 'Request conflict' }, { status: 409 })
    }
    if (RPC_VALIDATION_PATTERN.test(error.message)) {
      return NextResponse.json({ error: 'Bet validation failed' }, { status: 422 })
    }
    console.error('[tracked-bet] create_tracked_bet failed:', error.message)
    return NextResponse.json({ error: 'Transaction failed' }, { status: 500 })
  }

  const result = data as { bet_id: string; balance: number; replayed: boolean }

  return NextResponse.json({
    success:  true,
    bet_id:   result.bet_id,
    balance:  result.balance,
    replayed: result.replayed,
  })
}
