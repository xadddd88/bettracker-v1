import { NextResponse } from 'next/server'

import { checkTennisCalcAccess } from '@/lib/flags/tennis-calc'
import { ProviderError } from '@/lib/providers/errors'
import { enforceRateLimit, RATE_LIMITS } from '@/lib/rate-limit'
import { authenticateRequest } from '@/lib/supabase/request-auth'
import { fetchLast24HoursFortyForty } from '@/lib/tennis/forty-forty-analysis'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function deniedResponse(reason: string): NextResponse {
  if (reason === 'feature_disabled') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  if (reason === 'owner_not_configured') {
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 })
  }
  if (reason === 'not_owner') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}

function noStore<T>(body: T, status = 200): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'private, no-store, max-age=0' },
  })
}

export async function GET(req: Request) {
  const preflight = checkTennisCalcAccess(null)
  if (!preflight.allowed && preflight.reason !== 'unauthenticated') {
    return deniedResponse(preflight.reason)
  }

  const auth = await authenticateRequest(req)
  if (!auth.authorized) return deniedResponse('unauthenticated')

  const access = checkTennisCalcAccess(auth.user.id)
  if (!access.allowed) return deniedResponse(access.reason)

  const rateCheck = await enforceRateLimit(
    `tennis-forty-forty:${auth.user.id}`,
    RATE_LIMITS.tennisFortyFortyAnalysis(),
  )
  if (rateCheck.unavailable) {
    return noStore({ error: 'Service unavailable' }, 503)
  }
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { error: 'Too many requests' },
      {
        status: 429,
        headers: {
          'Cache-Control': 'private, no-store, max-age=0',
          'Retry-After': String(rateCheck.retryAfter || 60),
        },
      },
    )
  }

  try {
    const analysis = await fetchLast24HoursFortyForty()
    return noStore({ success: true, analysis })
  } catch (error) {
    if (error instanceof ProviderError) {
      console.error(`[tennis-forty-forty] provider request failed: ${error.kind}`)
    } else {
      console.error('[tennis-forty-forty] analysis failed')
    }
    return noStore({ error: 'Analysis unavailable' }, 503)
  }
}
