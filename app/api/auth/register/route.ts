import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { randomUUID } from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { trackServerEvent } from '@/lib/analytics/server'
import { EVENTS } from '@/lib/analytics/events'

const registerSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(8),
})

export async function POST(req: NextRequest) {
  // 1. Parse + validate input
  let body: unknown
  try { body = await req.json() } catch { body = null }

  const parsed = registerSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: 'Invalid email or password.' },
      { status: 400 },
    )
  }

  const { email, password } = parsed.data
  const emailNormalized = email.toLowerCase().trim()

  // Use a random distinct ID for pre-auth PostHog events (no email sent to PostHog)
  const anonId = randomUUID()

  await trackServerEvent(anonId, EVENTS.BETA_SIGNUP_ATTEMPTED, { source: 'login_page' })

  // 2. Initialise admin client (requires SUPABASE_SERVICE_ROLE_KEY)
  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch {
    console.error('[register] SUPABASE_SERVICE_ROLE_KEY is not configured')
    await trackServerEvent(anonId, EVENTS.BETA_SIGNUP_BLOCKED, {
      source: 'login_page',
      reason: 'service_unavailable',
    })
    return NextResponse.json(
      { success: false, error: 'Beta registration is temporarily unavailable. Try again later.' },
      { status: 503 },
    )
  }

  // 3. Check allowlist
  const { data: entry, error: lookupErr } = await admin
    .from('beta_access')
    .select('id, status')
    .eq('email_normalized', emailNormalized)
    .maybeSingle()

  if (lookupErr) {
    console.error('[register] beta_access lookup error:', lookupErr.message)
    await trackServerEvent(anonId, EVENTS.BETA_SIGNUP_BLOCKED, {
      source: 'login_page',
      reason: 'service_unavailable',
    })
    return NextResponse.json(
      { success: false, error: 'Beta registration is temporarily unavailable. Try again later.' },
      { status: 503 },
    )
  }

  if (!entry || entry.status !== 'approved') {
    const reason = !entry ? 'not_allowlisted' : 'revoked_or_used'
    await trackServerEvent(anonId, EVENTS.BETA_SIGNUP_BLOCKED, {
      source: 'login_page',
      reason,
    })
    return NextResponse.json(
      {
        success: false,
        error:   'BetTracker AI is currently in closed beta. Ask for access to join.',
      },
      { status: 403 },
    )
  }

  // 4. Track allowed — email is approved, proceeding to create account
  await trackServerEvent(anonId, EVENTS.BETA_SIGNUP_ALLOWED, { source: 'login_page' })

  // 5. Create user (email_confirm: true — no email confirmation required)
  const { data: authData, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })

  if (createErr || !authData?.user) {
    const msg = createErr?.message ?? ''
    const isDuplicate = /already|registered|exists/i.test(msg)
    if (isDuplicate) {
      await trackServerEvent(anonId, EVENTS.BETA_SIGNUP_BLOCKED, {
        source: 'login_page',
        reason: 'revoked_or_used',
      })
      return NextResponse.json(
        { success: false, error: 'Account already exists or access was already used. Try signing in.' },
        { status: 409 },
      )
    }
    console.error('[register] createUser failed:', createErr?.message)
    await trackServerEvent(anonId, EVENTS.BETA_SIGNUP_BLOCKED, {
      source: 'login_page',
      reason: 'service_unavailable',
    })
    return NextResponse.json(
      { success: false, error: 'Beta registration is temporarily unavailable. Try again later.' },
      { status: 503 },
    )
  }

  // 6. Mark beta_access entry as used (only after user is created successfully)
  const { error: markUsedErr } = await admin
    .from('beta_access')
    .update({
      status:          'used',
      used_at:         new Date().toISOString(),
      used_by_user_id: authData.user.id,
      updated_at:      new Date().toISOString(),
    })
    .eq('id', entry.id)

  if (markUsedErr) {
    console.error('[register] failed to mark beta_access as used:', markUsedErr.message)
    // Roll back: delete the auth user so beta_access stays approved and can be retried
    await admin.auth.admin.deleteUser(authData.user.id).catch(() => {})
    await trackServerEvent(anonId, EVENTS.BETA_SIGNUP_BLOCKED, {
      source: 'login_page',
      reason: 'service_unavailable',
    })
    return NextResponse.json(
      { success: false, error: 'Beta registration is temporarily unavailable. Try again later.' },
      { status: 503 },
    )
  }

  // 7. Track completed (now we have the real user ID)
  await trackServerEvent(authData.user.id, EVENTS.BETA_SIGNUP_COMPLETED, {
    source: 'login_page',
    reason: 'success',
  })

  return NextResponse.json({
    success: true,
    message: 'Account created. You can now sign in.',
  })
}
