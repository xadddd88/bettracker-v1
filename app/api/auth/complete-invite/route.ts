import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { trackServerEvent } from '@/lib/analytics/server'
import { EVENTS } from '@/lib/analytics/events'

// Decision #050 — consumes the beta_access invite AFTER the invitee has
// proven ownership (clicked the emailed link → authenticated session) and
// set a password. Marks the invitee's row 'used'. Idempotent: a row that
// is already 'used' by this same user returns success.
export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  const emailNormalized = user.email.toLowerCase().trim()

  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch {
    console.error('[complete-invite] SUPABASE_SERVICE_ROLE_KEY is not configured')
    return NextResponse.json({ success: false, error: 'Temporarily unavailable' }, { status: 503 })
  }

  const { data: entry, error: lookupErr } = await admin
    .from('beta_access')
    .select('id, status, used_by_user_id')
    .eq('email_normalized', emailNormalized)
    .maybeSingle()

  if (lookupErr) {
    console.error('[complete-invite] lookup error:', lookupErr.message)
    return NextResponse.json({ success: false, error: 'Temporarily unavailable' }, { status: 503 })
  }

  // No allowlist row, or it was revoked → do not consume.
  if (!entry || entry.status === 'revoked') {
    return NextResponse.json({ success: false, error: 'Not eligible' }, { status: 403 })
  }

  // Already consumed by this same user → idempotent success.
  if (entry.status === 'used') {
    if (entry.used_by_user_id && entry.used_by_user_id !== user.id) {
      return NextResponse.json({ success: false, error: 'Not eligible' }, { status: 403 })
    }
    return NextResponse.json({ success: true })
  }

  const nowIso = new Date().toISOString()
  const { error: markErr } = await admin
    .from('beta_access')
    .update({ status: 'used', used_at: nowIso, used_by_user_id: user.id, updated_at: nowIso })
    .eq('id', entry.id)

  if (markErr) {
    console.error('[complete-invite] mark-used failed:', markErr.message)
    return NextResponse.json({ success: false, error: 'Temporarily unavailable' }, { status: 503 })
  }

  await trackServerEvent(user.id, EVENTS.BETA_SIGNUP_COMPLETED, { source: 'set_password', reason: 'success' })
  return NextResponse.json({ success: true })
}
