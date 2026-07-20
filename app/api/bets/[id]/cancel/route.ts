import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { trackServerEvent } from '@/lib/analytics/server'
import { EVENTS } from '@/lib/analytics/events'

const uuidSchema = z.string().uuid()

function hasCode(message: string, code: string) {
  return message.toLowerCase().includes(code)
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const parsedId = uuidSchema.safeParse(id)
  const parsedKey = uuidSchema.safeParse(req.headers.get('idempotency-key'))
  if (!parsedId.success || !parsedKey.success) {
    return NextResponse.json({ error: 'Invalid cancellation request' }, { status: 400 })
  }

  // Defense in depth before the privileged RPC. The function repeats the
  // ownership check under a row lock and derives identity only from auth.uid().
  const { data: betRow } = await supabase
    .from('bets')
    .select('id')
    .eq('id', parsedId.data)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!betRow) {
    return NextResponse.json({ error: 'Bet not found' }, { status: 404 })
  }

  const { data, error } = await supabase.rpc('cancel_pending_bet', {
    p_bet_id: parsedId.data,
    p_idempotency_key: parsedKey.data,
  })

  if (error) {
    const message = error.message ?? ''
    const errorType = hasCode(message, 'bet_not_cancellable') ? 'not_cancellable'
      : hasCode(message, 'bet_not_found') ? 'not_found'
      : hasCode(message, 'idempotency_conflict') ? 'idempotency_conflict'
      : hasCode(message, 'stake_ledger_mismatch') ? 'ledger_mismatch'
      : 'rpc_error'

    await trackServerEvent(user.id, EVENTS.BET_CANCEL_FAILED, {
      bet_id: parsedId.data,
      error_type: errorType,
    })

    if (errorType === 'not_cancellable') {
      return NextResponse.json({ error: 'Only pending bets can be deleted' }, { status: 409 })
    }
    if (errorType === 'not_found') {
      return NextResponse.json({ error: 'Bet not found' }, { status: 404 })
    }
    if (errorType === 'idempotency_conflict') {
      return NextResponse.json({ error: 'Cancellation request conflict' }, { status: 409 })
    }

    return NextResponse.json({ error: 'Bet could not be deleted safely' }, { status: 500 })
  }

  await trackServerEvent(user.id, EVENTS.BET_CANCEL_SUCCEEDED, {
    bet_id: parsedId.data,
    replayed: Boolean((data as { replayed?: unknown } | null)?.replayed),
  })

  return NextResponse.json({ success: true, data })
}
