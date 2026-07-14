import { timingSafeEqual } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  SPORTMONKS_STRUCTURAL_PRESENCE_DRY_RUN_CONFIRMATION,
  SPORTMONKS_STRUCTURAL_PRESENCE_DRY_RUN_CONFIRMATION_ERROR,
  SPORTMONKS_STRUCTURAL_PRESENCE_DRY_RUN_MAX_PROVIDER_REQUESTS,
  runSportMonksStructuralPresenceDryRun,
} from '@/lib/providers/sportmonks-structural-presence-dry-run'
import {
  SPORTMONKS_ENRICHMENT_APPROVED_CANONICAL_FIXTURE_ID,
  SPORTMONKS_ENRICHMENT_APPROVED_PROVIDER_FIXTURE_ID,
} from '@/lib/providers/sportmonks-enrichment-dry-run'

export const runtime = 'nodejs'

// Decision #056: the body pins the exact canonical/provider identity pair,
// exact ordered Class A include set, and one-request ceiling. Any widening or
// reordering fails before DB preflight or provider-token loading.
const structuralPresenceDryRunBodySchema = z
  .object({
    dryRun: z.literal(true),
    provider: z.literal('sportmonks'),
    canonicalFixtureId: z.literal(SPORTMONKS_ENRICHMENT_APPROVED_CANONICAL_FIXTURE_ID),
    sportmonksFixtureId: z.literal(SPORTMONKS_ENRICHMENT_APPROVED_PROVIDER_FIXTURE_ID),
    requestedIncludeSet: z.tuple([
      z.literal('participants'),
      z.literal('league'),
      z.literal('season'),
      z.literal('round'),
      z.literal('venue'),
      z.literal('state'),
    ]),
    maxProviderRequests: z.literal(SPORTMONKS_STRUCTURAL_PRESENCE_DRY_RUN_MAX_PROVIDER_REQUESTS),
    operatorConfirm: z.string().min(1),
  })
  .strict()

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
      { success: false, error: 'Structural presence dry-run operator token is not configured' },
      { status: 503 }
    )
  }

  const provided = getBearerToken(req)
  if (!provided || !safeEqual(provided, expected)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  return null
}

export async function POST(req: NextRequest) {
  const unauthorized = authorize(req)
  if (unauthorized) return unauthorized

  try {
    const rawBody = await req.json().catch(() => ({}))
    const parsed = structuralPresenceDryRunBodySchema.safeParse(rawBody)

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid input', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    if (parsed.data.operatorConfirm !== SPORTMONKS_STRUCTURAL_PRESENCE_DRY_RUN_CONFIRMATION) {
      return NextResponse.json(
        { success: false, error: SPORTMONKS_STRUCTURAL_PRESENCE_DRY_RUN_CONFIRMATION_ERROR },
        { status: 400 }
      )
    }

    const report = await runSportMonksStructuralPresenceDryRun()
    return NextResponse.json(
      { success: report.responseStatus === 'ok', report },
      { status: 200 }
    )
  } catch (error) {
    console.error(
      '[sportmonks-structural-presence-dry-run] unhandled error:',
      error instanceof Error ? error.name : 'unknown'
    )
    return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500 })
  }
}
