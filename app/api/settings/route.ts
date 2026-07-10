import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { trackServerEvent } from '@/lib/analytics/server'
import { EVENTS } from '@/lib/analytics/events'

const CURRENCIES = ['USD', 'EUR', 'UAH', 'GBP', 'CAD', 'AUD'] as const

const settingsSchema = z.object({
  display_name:       z.string().max(50).optional(),
  currency:           z.enum(CURRENCIES).optional(),
  default_stake:      z.number().min(0.01).max(100_000).optional(),
  kelly_fraction:     z.number().min(0.1).max(1.0).optional(),
  web_search_enabled: z.boolean().optional(),
  timezone:           z.string().max(100).optional(),
})

export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = settingsSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
  }

  const updates = parsed.data
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No fields provided' }, { status: 400 })
  }

  // Decision #047: currency is synced to profiles AND the default
  // bankroll atomically via set_user_currency() — the route never
  // updates bankrolls directly, and a currency sync failure is a real
  // error, not a silently dropped second write.
  const { currency, ...profileUpdates } = updates

  if (Object.keys(profileUpdates).length > 0) {
    const { error } = await supabase
      .from('profiles')
      .update(profileUpdates)
      .eq('id', user.id)

    if (error) {
      console.error('[settings] profile update failed:', error.message)
      return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 })
    }
  }

  if (currency) {
    const { error: currencyError } = await supabase.rpc('set_user_currency', {
      p_currency: currency,
    })

    if (currencyError) {
      if (/no default bankroll/i.test(currencyError.message)) {
        return NextResponse.json({ error: 'Bankroll not found' }, { status: 404 })
      }
      console.error('[settings] currency sync failed:', currencyError.message)
      return NextResponse.json({ error: 'Failed to update currency' }, { status: 500 })
    }
  }

  const { data, error: readError } = await supabase
    .from('profiles')
    .select()
    .eq('id', user.id)
    .single()

  if (readError) {
    console.error('[settings] profile read-back failed:', readError.message)
    return NextResponse.json({ error: 'Failed to load settings' }, { status: 500 })
  }

  await trackServerEvent(user.id, EVENTS.SETTINGS_SAVED, {
    fields_changed: Object.keys(updates),
  })

  return NextResponse.json({ success: true, data })
}
