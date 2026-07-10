import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { randomUUID } from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { trackServerEvent } from '@/lib/analytics/server'
import { EVENTS } from '@/lib/analytics/events'
import { enforceRateLimit, RATE_LIMITS } from '@/lib/rate-limit'

// Decision #050 — invite flow. This route no longer accepts a password.
// It verifies the allowlist and sends a Supabase invite email to the
// address; the account only becomes usable after the real mailbox owner
// clicks the emailed link and sets a password on /auth/set-password.
// This proves email ownership and closes the pre-hijack: an attacker who
// knows an allowlisted address can only cause an invite to be sent to
// that address's real inbox — they never receive the link.
const requestSchema = z.object({
  email: z.string().email(),
})

// ─── Rate limit (durable, per client IP — Decision #052) ─────
function clientIp(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  return req.headers.get('x-real-ip')?.trim() ?? 'unknown'
}

// A single neutral response for every "we won't tell you the allowlist
// state" branch — prevents allowlist enumeration.
function neutralOk() {
  return NextResponse.json({
    success: true,
    message: 'If your email is approved for the beta, an invite link is on its way. Check your inbox.',
  })
}

function siteOrigin(req: NextRequest): string {
  return process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') ?? new URL(req.url).origin
}

export async function POST(req: NextRequest) {
  const rateCheck = await enforceRateLimit(`register:${clientIp(req)}`, RATE_LIMITS.register())
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { success: false, error: 'Too many attempts — please wait before trying again.' },
      { status: 429, headers: { 'Retry-After': String(rateCheck.retryAfter || 60) } },
    )
  }

  let body: unknown
  try { body = await req.json() } catch { body = null }

  const parsed = requestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: 'Enter a valid email.' }, { status: 400 })
  }

  const emailNormalized = parsed.data.email.toLowerCase().trim()
  const anonId = randomUUID()
  await trackServerEvent(anonId, EVENTS.BETA_SIGNUP_ATTEMPTED, { source: 'login_page' })

  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch {
    console.error('[register] SUPABASE_SERVICE_ROLE_KEY is not configured')
    await trackServerEvent(anonId, EVENTS.BETA_SIGNUP_BLOCKED, { source: 'login_page', reason: 'service_unavailable' })
    return NextResponse.json(
      { success: false, error: 'Beta registration is temporarily unavailable. Try again later.' },
      { status: 503 },
    )
  }

  const { data: entry, error: lookupErr } = await admin
    .from('beta_access')
    .select('id, status')
    .eq('email_normalized', emailNormalized)
    .maybeSingle()

  if (lookupErr) {
    console.error('[register] beta_access lookup error:', lookupErr.message)
    await trackServerEvent(anonId, EVENTS.BETA_SIGNUP_BLOCKED, { source: 'login_page', reason: 'service_unavailable' })
    return NextResponse.json(
      { success: false, error: 'Beta registration is temporarily unavailable. Try again later.' },
      { status: 503 },
    )
  }

  // Not allowlisted, already used, or revoked → neutral response (no
  // enumeration). Only 'approved' or a prior 'invited' (resend) proceed.
  if (!entry || (entry.status !== 'approved' && entry.status !== 'invited')) {
    await trackServerEvent(anonId, EVENTS.BETA_SIGNUP_BLOCKED, {
      source: 'login_page',
      reason: !entry ? 'not_allowlisted' : 'revoked_or_used',
    })
    return neutralOk()
  }

  await trackServerEvent(anonId, EVENTS.BETA_SIGNUP_ALLOWED, { source: 'login_page' })

  // Send the invite. The link goes to the real address and lands on the
  // set-password page (via the auth callback), which sets the password
  // and consumes the invite. No password is set here.
  const redirectTo = `${siteOrigin(req)}/auth/callback?next=/auth/set-password`
  const { error: inviteErr } = await admin.auth.admin.inviteUserByEmail(emailNormalized, { redirectTo })

  if (inviteErr) {
    // Already-registered means an invite/account already exists for this
    // address. If the row isn't yet 'used', the earlier invite email is
    // still the way in; return the same neutral message either way so we
    // never disclose account state.
    if (/already|registered|exists/i.test(inviteErr.message)) {
      await trackServerEvent(anonId, EVENTS.BETA_SIGNUP_BLOCKED, { source: 'login_page', reason: 'revoked_or_used' })
      return neutralOk()
    }
    console.error('[register] inviteUserByEmail failed:', inviteErr.message)
    await trackServerEvent(anonId, EVENTS.BETA_SIGNUP_BLOCKED, { source: 'login_page', reason: 'service_unavailable' })
    return NextResponse.json(
      { success: false, error: 'Beta registration is temporarily unavailable. Try again later.' },
      { status: 503 },
    )
  }

  // Mark invited (not used) — the invite is consumed only when the
  // password is set on /auth/set-password (proves ownership + intent).
  const nowIso = new Date().toISOString()
  const { error: markErr } = await admin
    .from('beta_access')
    .update({ status: 'invited', invited_at: nowIso, updated_at: nowIso })
    .eq('id', entry.id)

  if (markErr) {
    // The invite email was already sent; a stale 'approved'/'invited'
    // status is harmless (completion re-checks and marks 'used'). Log only.
    console.error('[register] failed to mark beta_access invited:', markErr.message)
  }

  await trackServerEvent(anonId, EVENTS.BETA_SIGNUP_ALLOWED, { source: 'login_page', reason: 'invited' })
  return neutralOk()
}
