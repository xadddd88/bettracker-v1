import { NextResponse } from 'next/server'
import { z } from 'zod'
import { EVENTS } from '@/lib/analytics/events'
import { trackServerEvent } from '@/lib/analytics/server'
import { checkTennisCalcAccess } from '@/lib/flags/tennis-calc'
import { enforceRateLimit, RATE_LIMITS } from '@/lib/rate-limit'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  activeMemberAuthErrorResponse,
  authenticateActiveMemberRequest,
} from '@/lib/supabase/request-auth'
import {
  MAX_MONEY_MINOR,
  formatMoneyMinor,
  parseMoneyMinor,
  parseOddsScaled,
} from '@/lib/tennis/contract'

type TennisCommand = 'create' | 'confirm' | 'settle' | 'stop'

const UUID = z.string().uuid()
const VERSION = z.number().int().min(0)
const POSITIVE_INTEGER = z.number().int().positive()
const MONEY_PATTERN = /^\d{1,12}(?:\.\d{1,2})?$/
const SIGNED_MONEY_PATTERN = /^-?\d{1,12}(?:\.\d{1,2})?$/
const ODDS_PATTERN = /^\d{1,2}(?:\.\d{1,3})?$/

function canonicalMoney(value: string): string {
  return formatMoneyMinor(parseMoneyMinor(value))
}

function canonicalSignedMoney(value: string): string {
  const negative = value.startsWith('-')
  const unsigned = negative ? value.slice(1) : value
  const minor = parseMoneyMinor(unsigned)
  if (minor > MAX_MONEY_MINOR) throw new Error('money_out_of_range')
  const formatted = formatMoneyMinor(minor)
  return negative && minor !== BigInt(0) ? `-${formatted}` : formatted
}

function canonicalOdds(value: string): string {
  const scaled = parseOddsScaled(value)
  const whole = scaled / BigInt(1000)
  const fraction = (scaled % BigInt(1000)).toString().padStart(3, '0')
  return `${whole.toString()}.${fraction}`
}

function moneySchema(options: { positive?: boolean; signed?: boolean } = {}) {
  const pattern = options.signed ? SIGNED_MONEY_PATTERN : MONEY_PATTERN
  return z.string().trim().regex(pattern, 'Expected an exact decimal string')
    .superRefine((value, ctx) => {
      try {
        const canonical = options.signed ? canonicalSignedMoney(value) : canonicalMoney(value)
        if (options.positive && canonical === '0.00') {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Amount must be greater than zero' })
        }
      } catch {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Amount is outside the supported range' })
      }
    })
    .transform(value => options.signed ? canonicalSignedMoney(value) : canonicalMoney(value))
}

const oddsSchema = z.string().trim().regex(ODDS_PATTERN, 'Expected an exact odds string')
  .superRefine((value, ctx) => {
    try {
      parseOddsScaled(value)
    } catch {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Odds are outside the supported range' })
    }
  })
  .transform(canonicalOdds)

const createSchema = z.object({
  operation_id: UUID,
  target_profit: moneySchema({ positive: true }),
  initial_stake: moneySchema({ positive: true }).nullable().optional().default(null),
  stake_increment: moneySchema({ positive: true }).default('0.01'),
  currency_or_unit: z.string().trim().min(1).max(16).default('USD'),
  bankroll_limit: moneySchema({ positive: true }),
  maximum_stake: moneySchema({ positive: true }).nullable().optional().default(null),
  maximum_steps: z.number().int().min(1).max(15),
  exposure_limit: moneySchema({ positive: true }),
  formula_version: z.string().trim().min(1).max(32),
  match_label: z.string().max(200).nullable().optional().default(null),
}).strict()

const confirmSchema = z.object({
  series_id: UUID,
  operation_id: UUID,
  expected_version: VERSION,
  set_number: POSITIVE_INTEGER.nullable().optional().default(null),
  game_number: POSITIVE_INTEGER.nullable().optional().default(null),
  quoted_odds: oddsSchema,
  accepted_odds: oddsSchema,
  accepted_stake: moneySchema({ positive: true }),
}).strict()

const settleSchema = z.object({
  series_id: UUID,
  step_id: UUID,
  operation_id: UUID,
  expected_version: VERSION,
  result: z.enum(['won', 'lost', 'void']),
  actual_return: moneySchema().nullable().optional().default(null),
}).strict().superRefine((value, ctx) => {
  if (value.result === 'won' && value.actual_return === null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['actual_return'], message: 'A win requires actual_return' })
  }
  if (value.result !== 'won' && value.actual_return !== null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['actual_return'], message: 'Only a win may include actual_return' })
  }
})

const stopSchema = z.object({
  series_id: UUID,
  operation_id: UUID,
  expected_version: VERSION,
}).strict()

const baseResultSchema = z.object({
  series_id: UUID,
  status: z.string(),
  version: VERSION,
  replayed: z.boolean(),
})

const resultSchemas = {
  create: baseResultSchema.extend({ status: z.enum(['draft']) }),
  confirm: baseResultSchema.extend({
    step_id: UUID,
    step_number: z.number().int().min(1).max(15),
    status: z.enum(['active']),
    recommended_stake: moneySchema({ positive: true }),
    loss_before: moneySchema(),
    target_profit_snapshot: moneySchema({ positive: true }),
    projected_series_result: moneySchema({ signed: true }),
  }),
  settle: baseResultSchema.extend({
    step_id: UUID,
    step_status: z.enum(['won', 'lost', 'void']),
    status: z.enum(['active', 'completed_win', 'limit_reached']),
  }),
  stop: baseResultSchema.extend({ status: z.enum(['stopped']) }),
} as const

const requestSchemas = {
  create: createSchema,
  confirm: confirmSchema,
  settle: settleSchema,
  stop: stopSchema,
} as const

const rpcNames = {
  create: 'tennis_create_series',
  confirm: 'tennis_confirm_step',
  settle: 'tennis_settle_step',
  stop: 'tennis_stop_series',
} as const

const successEvents = {
  create: EVENTS.TENNIS_SERIES_CREATED,
  confirm: EVENTS.TENNIS_STEP_CONFIRMED,
  settle: EVENTS.TENNIS_STEP_SETTLED,
  stop: EVENTS.TENNIS_SERIES_STOPPED,
} as const

function rpcArgs(command: TennisCommand, userId: string, input: Record<string, unknown>) {
  const args: Record<string, unknown> = { p_user_id: userId }
  for (const [key, value] of Object.entries(input)) args[`p_${key}`] = value
  return args
}

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

function rpcErrorResponse(message: string | undefined): NextResponse {
  const code = message?.trim().toLowerCase() ?? ''
  if (code === 'series_not_found' || code === 'step_not_found') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  if ([
    'idempotency_conflict',
    'version_conflict',
    'series_not_open',
    'series_not_active',
    'step_not_pending',
    'pending_step_exists',
  ].includes(code)) {
    return NextResponse.json({ error: 'Request conflict' }, { status: 409 })
  }
  if ([
    'invalid_identity_or_operation',
    'invalid_version',
    'invalid_set_number',
    'invalid_game_number',
    'invalid_odds',
    'invalid_stake',
    'invalid_calculation_input',
    'recommended_stake_out_of_range',
    'projected_result_out_of_range',
    'invalid_result',
    'return_required',
    'unexpected_return',
    'max_games',
    'bankroll_limit',
    'maximum_stake',
    'exposure_limit',
  ].includes(code)) {
    return NextResponse.json({ error: 'Command rejected' }, { status: 422 })
  }
  return NextResponse.json({ error: 'Transaction failed' }, { status: 500 })
}

/**
 * The only application-level write bridge for Tennis Live Series PR-4.
 *
 * It deliberately owns the entire boundary: disabled flag, authenticated owner,
 * durable fail-closed rate limit, strict decimal-string validation, session-derived
 * user id, service-role RPC call, and sanitized output/error handling.
 */
export async function runTennisWrite(req: Request, command: TennisCommand): Promise<NextResponse> {
  const preflight = checkTennisCalcAccess(null)
  if (!preflight.allowed && preflight.reason !== 'unauthenticated') {
    return deniedResponse(preflight.reason)
  }

  const auth = await authenticateActiveMemberRequest(req)
  if (!auth.authorized) return activeMemberAuthErrorResponse(auth)

  const access = checkTennisCalcAccess(auth.user.id)
  if (!access.allowed) return deniedResponse(access.reason)

  const rateCheck = await enforceRateLimit(`tennis-series:${auth.user.id}`, RATE_LIMITS.tennisSeries())
  if (rateCheck.unavailable) {
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 })
  }
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(rateCheck.retryAfter || 60) } },
    )
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = requestSchemas[command].safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  }

  try {
    const admin = createAdminClient()
    const { data, error } = await admin.rpc(
      rpcNames[command],
      rpcArgs(command, auth.user.id, parsed.data as Record<string, unknown>),
    )

    if (error) return rpcErrorResponse(error.message)

    const validated = resultSchemas[command].safeParse(data)
    if (!validated.success) {
      console.error(`[tennis-series] ${command} returned a malformed result`)
      return NextResponse.json({ error: 'Transaction failed' }, { status: 500 })
    }

    await trackServerEvent(auth.user.id, successEvents[command], {
      replayed: validated.data.replayed,
      resulting_status: validated.data.status,
      ...(command === 'settle'
        ? { outcome: (parsed.data as z.infer<typeof settleSchema>).result }
        : {}),
    })

    return NextResponse.json({ success: true, ...validated.data })
  } catch (error) {
    console.error(
      `[tennis-series] ${command} failed:`,
      error instanceof Error ? error.name : 'unknown',
    )
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 })
  }
}
