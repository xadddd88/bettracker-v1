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

// Decision #048: the route performs exactly ONE save_user_settings()
// RPC call — profile fields and the default-bankroll currency sync are
// a single DB transaction (profiles is SELECT-only for authenticated
// after migration 018). The RPC returns the updated profile row, so no
// separate read-back is needed.
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

  const { data, error } = await supabase.rpc('save_user_settings', {
    p_display_name:       updates.display_name ?? null,
    p_currency:           updates.currency ?? null,
    p_default_stake:      updates.default_stake ?? null,
    p_kelly_fraction:     updates.kelly_fraction ?? null,
    p_web_search_enabled: updates.web_search_enabled ?? null,
    p_timezone:           updates.timezone ?? null,
  })

  if (error) {
    if (/no default bankroll/i.test(error.message)) {
      return NextResponse.json({ error: 'Bankroll not found' }, { status: 404 })
    }
    console.error('[settings] save_user_settings failed:', error.message)
    return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 })
  }

  await trackServerEvent(user.id, EVENTS.SETTINGS_SAVED, {
    fields_changed: Object.keys(updates),
  })

  return NextResponse.json({ success: true, data })
}
