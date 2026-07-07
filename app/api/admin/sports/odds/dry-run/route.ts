import { timingSafeEqual } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { ProviderError } from '@/lib/providers/errors'
import {
  type OddsDryRunSupabaseClient,
  READ_ONLY_ODDS_BET_ID,
  READ_ONLY_ODDS_PROVIDER_FIXTURE_ID,
  runReadOnlyOddsDryRun,
} from '@/lib/providers/odds-dry-run'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
const READ_ONLY_ODDS_DRY_RUN_CONFIRMATION = 'RUN_READ_ONLY_ODDS_DRY_RUN_M1_3'
const READ_ONLY_ODDS_DRY_RUN_CONFIRMATION_ERROR =
  'read-only odds dry-run requires explicit operator confirmation'

const oddsDryRunBodySchema = z.object({
  dryRun: z.literal(true),
  providerFixtureId: z.literal(READ_ONLY_ODDS_PROVIDER_FIXTURE_ID),
  betId: z.literal(READ_ONLY_ODDS_BET_ID),
  operatorConfirm: z.string().min(1),
}).strict()

function getBearerToken(req: NextRequest): string | null {
  const authorization = req.headers.get('authorization')
  if (authorization?.startsWith('Bearer ')) return authorization.slice('Bearer '.length).trim()
  return req.headers.get('x-bettracker-sync-token')?.trim() ?? null
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}

function authorize(req: NextRequest): NextResponse | null {
  const expected = process.env.SPORTS_FIXTURE_SYNC_OPERATOR_TOKEN
  if (!expected) {
    return NextResponse.json(
      { success: false, error: 'Odds dry-run operator token is not configured' },
      { status: 503 }
    )
  }

  const provided = getBearerToken(req)
  if (!provided || !safeEqual(provided, expected)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  return null
}

function providerErrorStatus(error: ProviderError): number {
  if (error.kind === 'auth') return 502
  if (error.kind === 'rate_limit') return 429
  if (error.kind === 'timeout' || error.kind === 'network') return 504
  return 502
}

function hasApprovedStaticScope(rawBody: unknown): boolean {
  if (!rawBody || typeof rawBody !== 'object') return false
  const body = rawBody as Record<string, unknown>
  return (
    body.dryRun === true &&
    body.providerFixtureId === READ_ONLY_ODDS_PROVIDER_FIXTURE_ID &&
    body.betId === READ_ONLY_ODDS_BET_ID
  )
}

export async function POST(req: NextRequest) {
  const unauthorized = authorize(req)
  if (unauthorized) return unauthorized

  try {
    const rawBody = await req.json().catch(() => ({}))
    const parsed = oddsDryRunBodySchema.safeParse(rawBody)

    if (!parsed.success) {
      if (hasApprovedStaticScope(rawBody)) {
        return NextResponse.json(
          { success: false, error: READ_ONLY_ODDS_DRY_RUN_CONFIRMATION_ERROR },
          { status: 400 }
        )
      }

      return NextResponse.json(
        { success: false, error: 'Invalid input', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    if (parsed.data.operatorConfirm !== READ_ONLY_ODDS_DRY_RUN_CONFIRMATION) {
      return NextResponse.json(
        { success: false, error: READ_ONLY_ODDS_DRY_RUN_CONFIRMATION_ERROR },
        { status: 400 }
      )
    }

    const supabase = createAdminClient() as unknown as OddsDryRunSupabaseClient
    const report = await runReadOnlyOddsDryRun({ supabase })

    return NextResponse.json(
      {
        success: report.preflight.passed,
        report,
      },
      { status: report.preflight.passed ? 200 : 400 }
    )
  } catch (error) {
    if (error instanceof ProviderError) {
      return NextResponse.json(
        { success: false, error: error.message, provider: error.provider, kind: error.kind },
        { status: providerErrorStatus(error) }
      )
    }

    console.error('[odds-dry-run] unhandled error:', error instanceof Error ? error.name : 'unknown')
    return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500 })
  }
}
