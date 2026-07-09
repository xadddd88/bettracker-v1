import { timingSafeEqual } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  APPROVED_PROVIDER_LINK,
  SPORTMONKS_PROVIDER_LINK_WRITE_CONFIRMATION,
  SPORTMONKS_PROVIDER_LINK_WRITE_CONFIRMATION_ERROR,
  runSportmonksProviderLinkWrite,
} from '@/lib/providers/sportmonks-provider-link-write'

export const runtime = 'nodejs'

// M1.2.e.2.b.3 (Decision #045): the approved scope is structurally pinned —
// ONE link row, both sides literal, zero provider calls. Widening any literal
// requires a new PR + CPO approval.
const providerLinkBodySchema = z
  .object({
    dryRun: z.boolean().default(true),
    provider: z.literal('sportmonks'),
    canonicalFixtureId: z.literal(APPROVED_PROVIDER_LINK.canonicalFixtureId),
    sportmonksFixtureId: z.literal(APPROVED_PROVIDER_LINK.providerFixtureId),
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
      { success: false, error: 'Provider-link write operator token is not configured' },
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
    const parsed = providerLinkBodySchema.safeParse(rawBody)

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid input', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    if (parsed.data.operatorConfirm !== SPORTMONKS_PROVIDER_LINK_WRITE_CONFIRMATION) {
      return NextResponse.json(
        { success: false, error: SPORTMONKS_PROVIDER_LINK_WRITE_CONFIRMATION_ERROR },
        { status: 400 }
      )
    }

    const report = await runSportmonksProviderLinkWrite({
      dryRun: parsed.data.dryRun,
      operatorConfirm: parsed.data.operatorConfirm,
    })

    const success = report.preflight.passed && (report.wrote?.failedWrites ?? 0) === 0

    return NextResponse.json(
      {
        success,
        writeConfirmationRequiredForWrites: SPORTMONKS_PROVIDER_LINK_WRITE_CONFIRMATION,
        report,
      },
      { status: 200 }
    )
  } catch (error) {
    console.error(
      '[sportmonks-provider-link-write] unhandled error:',
      error instanceof Error ? error.name : 'unknown'
    )
    return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500 })
  }
}
