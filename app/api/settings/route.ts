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

  const { data, error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', user.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (updates.currency) {
    await supabase
      .from('bankrolls')
      .update({ currency: updates.currency })
      .eq('user_id', user.id)
      .eq('is_default', true)
  }

  await trackServerEvent(user.id, EVENTS.SETTINGS_SAVED, {
    fields_changed: Object.keys(updates),
  })

  return NextResponse.json({ success: true, data })
}
