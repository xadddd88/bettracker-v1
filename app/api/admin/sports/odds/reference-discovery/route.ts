import { timingSafeEqual } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { ProviderError } from '@/lib/providers/errors'
import {
  ODDS_REFERENCE_DISCOVERY_CONFIRMATION,
  ODDS_REFERENCE_DISCOVERY_CONFIRMATION_ERROR,
  ODDS_REFERENCE_DISCOVERY_MAX_PROVIDER_REQUESTS,
  runBookmakerMappingDiscovery,
} from '@/lib/providers/odds-reference-discovery'

export const runtime = 'nodejs'

const referenceDiscoveryBodySchema = z.object({
  dryRun: z.literal(true),
  endpoints: z.tuple([z.literal('bookmakers'), z.literal('mapping')]),
  maxProviderRequests: z.literal(ODDS_REFERENCE_DISCOVERY_MAX_PROVIDER_REQUESTS),
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
      { success: false, error: 'Odds reference discovery operator token is not configured' },
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
    Array.isArray(body.endpoints) &&
    body.endpoints.length === 2 &&
    body.endpoints[0] === 'bookmakers' &&
    body.endpoints[1] === 'mapping' &&
    body.maxProviderRequests === ODDS_REFERENCE_DISCOVERY_MAX_PROVIDER_REQUESTS
  )
}

export async function POST(req: NextRequest) {
  const unauthorized = authorize(req)
  if (unauthorized) return unauthorized

  try {
    const rawBody = await req.json().catch(() => ({}))
    const parsed = referenceDiscoveryBodySchema.safeParse(rawBody)

    if (!parsed.success) {
      if (hasApprovedStaticScope(rawBody)) {
        return NextResponse.json(
          { success: false, error: ODDS_REFERENCE_DISCOVERY_CONFIRMATION_ERROR },
          { status: 400 }
        )
      }

      return NextResponse.json(
        { success: false, error: 'Invalid input', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    if (parsed.data.operatorConfirm !== ODDS_REFERENCE_DISCOVERY_CONFIRMATION) {
      return NextResponse.json(
        { success: false, error: ODDS_REFERENCE_DISCOVERY_CONFIRMATION_ERROR },
        { status: 400 }
      )
    }

    const report = await runBookmakerMappingDiscovery()

    return NextResponse.json(
      {
        success: true,
        report,
      },
      { status: 200 }
    )
  } catch (error) {
    if (error instanceof ProviderError) {
      return NextResponse.json(
        { success: false, error: error.message, provider: error.provider, kind: error.kind },
        { status: providerErrorStatus(error) }
      )
    }

    console.error(
      '[odds-reference-discovery] unhandled error:',
      error instanceof Error ? error.name : 'unknown'
    )
    return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500 })
  }
}
