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
import { authorizeDecision056GitHubOidcRequest } from '@/lib/security/github-actions-oidc'

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

export async function POST(req: NextRequest) {
  const authorization = await authorizeDecision056GitHubOidcRequest(req.headers)
  if (!authorization.ok) {
    const error =
      authorization.status === 503
        ? 'Decision #056 OIDC authorization is not configured'
        : 'Unauthorized'
    return NextResponse.json({ success: false, error }, { status: authorization.status })
  }

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
