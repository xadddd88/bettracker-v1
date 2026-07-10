import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { trackServerEvent } from '@/lib/analytics/server'
import { EVENTS } from '@/lib/analytics/events'
import { bucketAmount } from '@/lib/analytics/buckets'

const schema = z.object({
  amount:          z.number().positive('Amount must be positive').max(100_000_000, 'Amount exceeds limit'),
  type:            z.enum(['deposit', 'withdrawal']),
  note:            z.string().max(200).optional(),
  idempotency_key: z.string().uuid('Idempotency key must be a UUID'),
})

// Decision #047: the route no longer touches bankrolls or
// bankroll_transactions directly. One adjust_bankroll() RPC does the
// row lock, funds guard, balance update and transaction insert in a
// single DB transaction — success here means the WHOLE operation
// committed, never a partial write.
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
  }

  const { amount, type, note, idempotency_key } = parsed.data

  const { data, error } = await supabase.rpc('adjust_bankroll', {
    p_type:            type,
    p_amount:          amount,
    p_note:            note ?? null,
    p_idempotency_key: idempotency_key,
  })

  if (error) {
    if (/insufficient balance/i.test(error.message)) {
      return NextResponse.json({ error: 'Insufficient balance' }, { status: 422 })
    }
    if (/no default bankroll/i.test(error.message)) {
      return NextResponse.json({ error: 'Bankroll not found' }, { status: 404 })
    }
    if (/idempotency conflict/i.test(error.message)) {
      return NextResponse.json({ error: 'Request conflict' }, { status: 409 })
    }
    console.error('[deposit] adjust_bankroll failed:', error.message)
    return NextResponse.json({ error: 'Transaction failed' }, { status: 500 })
  }

  const result = data as { transaction_id: string; balance: number; replayed: boolean }

  if (!result.replayed) {
    const eventName = type === 'deposit' ? EVENTS.DEPOSIT_RECORDED : EVENTS.WITHDRAWAL_RECORDED
    await trackServerEvent(user.id, eventName, { amount_bucket: bucketAmount(amount) })
  }

  return NextResponse.json({
    success:        true,
    balance:        result.balance,
    transaction_id: result.transaction_id,
    replayed:       result.replayed,
  })
}
