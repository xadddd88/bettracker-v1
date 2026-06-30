import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { trackServerEvent } from '@/lib/analytics/server'
import { EVENTS } from '@/lib/analytics/events'

const VALID_OUTCOMES = ['won', 'lost', 'void'] as const
type Outcome = typeof VALID_OUTCOMES[number]

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  // Verify ownership before calling the RPC — settle_bet is likely SECURITY DEFINER
  // (bypasses RLS), so we must enforce user_id scoping here in the route.
  const { data: betRow } = await supabase
    .from('bets')
    .select('id, status')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!betRow) {
    return NextResponse.json({ error: 'Bet not found' }, { status: 404 })
  }

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const outcome = (body as Record<string, unknown>)?.outcome as string
  if (!VALID_OUTCOMES.includes(outcome as Outcome)) {
    return NextResponse.json({ error: 'outcome must be won, lost, or void' }, { status: 400 })
  }

  const { data, error } = await supabase.rpc('settle_bet', {
    p_bet_id:  id,
    p_outcome: outcome,
  })

  if (error) {
    const errorType = error.message === 'already_settled' ? 'already_settled'
      : error.message === 'bet_not_found' ? 'not_found'
      : 'rpc_error'
    await trackServerEvent(user.id, EVENTS.BET_SETTLE_FAILED, { bet_id: id, error_type: errorType })

    if (error.message === 'already_settled')
      return NextResponse.json({ error: 'Bet is already settled' }, { status: 409 })
    if (error.message === 'bet_not_found')
      return NextResponse.json({ error: 'Bet not found' }, { status: 404 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const eventName = outcome === 'won'  ? EVENTS.BET_SETTLE_WON
    : outcome === 'lost' ? EVENTS.BET_SETTLE_LOST
    : EVENTS.BET_SETTLE_VOID
  await trackServerEvent(user.id, eventName, { bet_id: id, outcome })

  return NextResponse.json({ success: true, data })
}
