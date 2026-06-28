import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

const schema = z.object({
  amount: z.number().positive('Amount must be positive'),
  type:   z.enum(['deposit', 'withdrawal']),
  note:   z.string().max(200).optional(),
})

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

  const { amount, type, note } = parsed.data

  // Get default bankroll
  const { data: bankroll, error: brErr } = await supabase
    .from('bankrolls')
    .select('id, balance')
    .eq('user_id', user.id)
    .eq('is_default', true)
    .single()

  if (brErr || !bankroll) {
    return NextResponse.json({ error: 'Bankroll not found' }, { status: 404 })
  }

  const delta       = type === 'deposit' ? amount : -amount
  const newBalance  = bankroll.balance + delta

  if (type === 'withdrawal' && newBalance < 0) {
    return NextResponse.json({ error: 'Insufficient balance' }, { status: 422 })
  }

  // Update balance
  const { error: updateErr } = await supabase
    .from('bankrolls')
    .update({ balance: newBalance })
    .eq('id', bankroll.id)
    .eq('user_id', user.id)

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 })
  }

  // Insert transaction record
  await supabase.from('bankroll_transactions').insert({
    user_id:       user.id,
    bankroll_id:   bankroll.id,
    type,
    amount:        delta,
    balance_after: newBalance,
    ...(note ? { notes: note } : {}),
  })

  return NextResponse.json({ success: true, balance: newBalance })
}
