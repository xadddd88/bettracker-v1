import { timingSafeEqual } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { ProviderError } from '@/lib/providers/errors'
import {
  DEFAULT_FIXTURE_SYNC_PROVIDERS,
  FIXTURE_SYNC_WRITE_CONFIRMATION,
  FIXTURE_SYNC_WRITE_SINGLE_DAY_ERROR,
  FIXTURE_SYNC_WRITE_SINGLE_PROVIDER_ERROR,
  FixtureSyncSafetyError,
  runFixtureSync,
  type FixtureSyncProvider,
} from '@/lib/providers/fixture-sync'

export const runtime = 'nodejs'

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD')
const DAY_MS = 24 * 60 * 60 * 1000
const MAX_FIXTURE_SYNC_RANGE_DAYS = 7
const DATE_RANGE_LIMIT_ERROR = 'date range exceeds M1.2.b safety limit of 7 days'

const fixtureSyncBodySchema = z
  .object({
    providers: z.array(z.enum(['api_football', 'api_tennis'])).min(1).optional(),
    dateFrom: dateSchema,
    dateTo: dateSchema,
    competitionIds: z.array(z.string().min(1).max(80)).max(50).optional(),
    dryRun: z.boolean().default(true),
    operatorConfirm: z.string().optional(),
  })
  .refine((body) => body.dateFrom <= body.dateTo, {
    message: 'dateFrom must be on or before dateTo',
    path: ['dateTo'],
  })

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
      { success: false, error: 'Fixture sync operator token is not configured' },
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

function dateOnlyToUtcMs(value: string): number {
  const [year, month, day] = value.split('-').map(Number)
  return Date.UTC(year, month - 1, day)
}

function fixtureSyncRangeDays(dateFrom: string, dateTo: string): number {
  return Math.floor((dateOnlyToUtcMs(dateTo) - dateOnlyToUtcMs(dateFrom)) / DAY_MS) + 1
}

function requestedProviders(body: z.infer<typeof fixtureSyncBodySchema>): FixtureSyncProvider[] {
  return body.providers?.length ? body.providers : [...DEFAULT_FIXTURE_SYNC_PROVIDERS]
}

function validateWriteSafety(body: z.infer<typeof fixtureSyncBodySchema>): NextResponse | null {
  if (body.dryRun) return null

  if (requestedProviders(body).length !== 1) {
    return NextResponse.json({ success: false, error: FIXTURE_SYNC_WRITE_SINGLE_PROVIDER_ERROR }, { status: 400 })
  }

  if (body.dateFrom !== body.dateTo) {
    return NextResponse.json({ success: false, error: FIXTURE_SYNC_WRITE_SINGLE_DAY_ERROR }, { status: 400 })
  }

  return null
}

export async function POST(req: NextRequest) {
  const unauthorized = authorize(req)
  if (unauthorized) return unauthorized

  try {
    const body = await req.json()
    const parsed = fixtureSyncBodySchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid input', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    if (fixtureSyncRangeDays(parsed.data.dateFrom, parsed.data.dateTo) > MAX_FIXTURE_SYNC_RANGE_DAYS) {
      return NextResponse.json({ success: false, error: DATE_RANGE_LIMIT_ERROR }, { status: 400 })
    }

    const writeSafetyError = validateWriteSafety(parsed.data)
    if (writeSafetyError) return writeSafetyError

    const report = await runFixtureSync(parsed.data)

    return NextResponse.json({
      success: true,
      writeConfirmationRequiredForWrites: FIXTURE_SYNC_WRITE_CONFIRMATION,
      report,
    })
  } catch (error) {
    if (error instanceof FixtureSyncSafetyError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 })
    }

    if (error instanceof ProviderError) {
      return NextResponse.json(
        { success: false, error: error.message, provider: error.provider, kind: error.kind },
        { status: providerErrorStatus(error) }
      )
    }

    console.error('[fixture-sync] unhandled error:', error instanceof Error ? error.name : 'unknown')
    return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500 })
  }
}
