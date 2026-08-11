import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { trackServerEvent } from '@/lib/analytics/server'
import { EVENTS } from '@/lib/analytics/events'

// Decision #050 / Security S2.2 — consumes the invite only after mailbox
// ownership is proven. One service-only RPC owns lookup, row locking and state
// transition so a concurrent revoke cannot be overwritten.
export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch {
    console.error('[complete-invite] SUPABASE_SERVICE_ROLE_KEY is not configured')
    return NextResponse.json({ success: false, error: 'Temporarily unavailable' }, { status: 503 })
  }

  const { data: outcome, error } = await admin.rpc('consume_beta_access_invite', {
    p_user_id: user.id,
    p_email: user.email,
  })

  if (error) {
    console.error('[complete-invite] consume RPC failed:', error.message)
    return NextResponse.json({ success: false, error: 'Temporarily unavailable' }, { status: 503 })
  }

  if (outcome === 'not_eligible') {
    return NextResponse.json({ success: false, error: 'Not eligible' }, { status: 403 })
  }
  if (outcome !== 'consumed' && outcome !== 'already_used') {
    console.error('[complete-invite] consume RPC returned an unknown outcome')
    return NextResponse.json({ success: false, error: 'Temporarily unavailable' }, { status: 503 })
  }

  if (outcome === 'consumed') {
    await trackServerEvent(user.id, EVENTS.BETA_SIGNUP_COMPLETED, { source: 'set_password', reason: 'success' })
  }

  return NextResponse.json({ success: true })
}
