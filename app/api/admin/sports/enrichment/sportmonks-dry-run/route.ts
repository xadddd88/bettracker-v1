import { timingSafeEqual } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  SPORTMONKS_ENRICHMENT_APPROVED_CANONICAL_FIXTURE_ID,
  SPORTMONKS_ENRICHMENT_APPROVED_PROVIDER_FIXTURE_ID,
  SPORTMONKS_ENRICHMENT_DRY_RUN_CONFIRMATION,
  SPORTMONKS_ENRICHMENT_DRY_RUN_CONFIRMATION_ERROR,
  SPORTMONKS_ENRICHMENT_DRY_RUN_MAX_PROVIDER_REQUESTS,
  runSportMonksEnrichmentDryRun,
} from '@/lib/providers/sportmonks-enrichment-dry-run'

export const runtime = 'nodejs'

// M1.2.e (Decision #034): canonical-linked SportMonks read-only enrichment
// dry-run. The approved scope is structurally pinned — one approved canonical
// fixture, one approved provider fixture id, empty include set, max 1
// provider request, zero writes. Widening any literal requires a new PR +
// CPO approval. All failure paths return sanitized reports only.
const enrichmentDryRunBodySchema = z
  .object({
    dryRun: z.literal(true),
    provider: z.literal('sportmonks'),
    canonicalFixtureId: z.literal(SPORTMONKS_ENRICHMENT_APPROVED_CANONICAL_FIXTURE_ID),
    sportmonksFixtureId: z.literal(SPORTMONKS_ENRICHMENT_APPROVED_PROVIDER_FIXTURE_ID),
    requestedIncludeSet: z.tuple([]),
    maxProviderRequests: z.literal(SPORTMONKS_ENRICHMENT_DRY_RUN_MAX_PROVIDER_REQUESTS),
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
      { success: false, error: 'Enrichment dry-run operator token is not configured' },
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
    const parsed = enrichmentDryRunBodySchema.safeParse(rawBody)

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid input', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    if (parsed.data.operatorConfirm !== SPORTMONKS_ENRICHMENT_DRY_RUN_CONFIRMATION) {
      return NextResponse.json(
        { success: false, error: SPORTMONKS_ENRICHMENT_DRY_RUN_CONFIRMATION_ERROR },
        { status: 400 }
      )
    }

    // The lib owns preflight, the single provider request, identity
    // validation, and sanitization; every failure path yields a sanitized
    // report (never a raw provider error or payload).
    const report = await runSportMonksEnrichmentDryRun()

    return NextResponse.json(
      { success: report.responseStatus === 'ok', report },
      { status: 200 }
    )
  } catch (error) {
    console.error(
      '[sportmonks-enrichment-dry-run] unhandled error:',
      error instanceof Error ? error.name : 'unknown'
    )
    return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500 })
  }
}
