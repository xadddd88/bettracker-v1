import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  throw new Error('[BetTracker] Sentry test — server-side error from /api/sentry-example-api')

  // eslint-disable-next-line no-unreachable
  return NextResponse.json({ ok: true })
}
