import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { trackServerEvent } from '@/lib/analytics/server'
import { EVENTS } from '@/lib/analytics/events'
import { bucketScoutScore } from '@/lib/analytics/buckets'

// ─── Rate limit store (in-memory) ────────────────────────────
const rateLimitStore = new Map<string, { minute: number; day: number; minuteTs: number; dayTs: number }>()

const RATE_LIMIT_PER_MINUTE = 3
const RATE_LIMIT_PER_DAY    = 15

const TIMEOUT_WITH_WEB_SEARCH_MS    = 55_000
const TIMEOUT_WITHOUT_WEB_SEARCH_MS = 55_000

function extractJsonObject(rawText: string): string {
  const withoutFence = rawText
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim()

  const start = withoutFence.indexOf('{')
  const end = withoutFence.lastIndexOf('}')

  if (start === -1 || end === -1 || end <= start) {
    throw new Error('no_json_found')
  }

  return withoutFence.slice(start, end + 1).trim()
}

function checkRateLimit(userId: string): { allowed: boolean; retryAfter?: number } {
  const now = Date.now()
  const minuteWindow = 60_000
  const dayWindow    = 86_400_000

  const entry = rateLimitStore.get(userId) ?? {
    minute: 0, day: 0,
    minuteTs: now, dayTs: now,
  }

  if (now - entry.minuteTs > minuteWindow) { entry.minute = 0; entry.minuteTs = now }
  if (now - entry.dayTs > dayWindow)        { entry.day = 0;    entry.dayTs = now }

  if (entry.minute >= RATE_LIMIT_PER_MINUTE) {
    return { allowed: false, retryAfter: Math.ceil((entry.minuteTs + minuteWindow - now) / 1000) }
  }
  if (entry.day >= RATE_LIMIT_PER_DAY) {
    return { allowed: false, retryAfter: Math.ceil((entry.dayTs + dayWindow - now) / 1000) }
  }

  entry.minute++
  entry.day++
  rateLimitStore.set(userId, entry)
  return { allowed: true }
}

// ─── Error taxonomy ───────────────────────────────────────────
type ScoutErrorType =
  | 'anthropic_rate_limited'
  | 'anthropic_overloaded'
  | 'anthropic_timeout'
  | 'anthropic_network'
  | 'anthropic_invalid_json'
  | 'anthropic_schema_mismatch'
  | 'anthropic_provider_error'
  | 'persist'
  | 'unknown'

type ClassifiedError = { type: ScoutErrorType; status: number; message: string }

function classifyAnthropicError(err: unknown): ClassifiedError {
  if (err instanceof Anthropic.RateLimitError) {
    return {
      type: 'anthropic_rate_limited',
      status: 429,
      message: 'Scout is temporarily unavailable due to high demand. Please try again in a few minutes.',
    }
  }
  if (err instanceof Anthropic.InternalServerError && err.status === 529) {
    return {
      type: 'anthropic_overloaded',
      status: 503,
      message: 'Scout is temporarily unavailable. Please try again shortly.',
    }
  }
  if (
    err instanceof Anthropic.APIConnectionTimeoutError ||
    (err instanceof Error && err.name === 'AbortError')
  ) {
    return {
      type: 'anthropic_timeout',
      status: 504,
      message: 'Scout took too long to respond. Please try again.',
    }
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return {
      type: 'anthropic_network',
      status: 503,
      message: 'Unable to reach Scout provider. Please try again.',
    }
  }
  if (err instanceof Anthropic.AuthenticationError) {
    console.error('[scout] anthropic auth error:', err.status, err.message)
    return {
      type: 'anthropic_provider_error',
      status: 502,
      message: 'Scout is temporarily unavailable. Please try again.',
    }
  }
  if (err instanceof Anthropic.APIError) {
    console.error('[scout] anthropic api error:', err.status, err.message)
    return {
      type: 'anthropic_provider_error',
      status: 502,
      message: 'Scout is temporarily unavailable. Please try again.',
    }
  }
  return { type: 'unknown', status: 500, message: 'Internal error' }
}

// ─── Claude call with AbortController timeout ─────────────────
async function callClaudeWithTimeout(
  fn: (signal: AbortSignal) => Promise<Anthropic.Message>,
  timeoutMs: number,
): Promise<Anthropic.Message> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fn(controller.signal)
  } finally {
    clearTimeout(timer)
  }
}

// ─── Zod schemas ─────────────────────────────────────────────
const SPORTS     = ['tennis', 'soccer', 'cs2', 'basketball', 'ice_hockey', 'mma', 'other'] as const
const LOCALES    = ['auto', 'uk', 'ru', 'en', 'es', 'fr', 'de', 'ar'] as const
const TIMEFRAMES = ['today', 'tomorrow', 'this_week', 'custom'] as const

const requestSchema = z.object({
  sport:           z.enum(SPORTS),
  context:         z.string().min(1).max(1000),
  timeframe:       z.enum(TIMEFRAMES),
  output_language: z.enum(LOCALES).default('auto'),
})

const candidateSchema = z.object({
  event_name:          z.string().min(1).max(500),
  market_type:         z.string().min(1).max(200),
  selection:           z.string().max(200).nullish(),
  match_date:          z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  offered_odds:        z.number().nullish(),
  opportunity_type:    z.enum(['value', 'contrarian', 'pattern', 'general']),
  scout_score:         z.number().int().min(0).max(100),
  model_probability:   z.number().min(0).max(100),
  implied_probability: z.number().min(0).max(100).nullish(),
  edge_percent:        z.number().nullish(),
  confidence_score:    z.number().int().min(0).max(100),
  risk_level:          z.enum(['low', 'medium', 'high']),
  reasoning:           z.string().min(10),
  required_checks:     z.array(z.string().min(1)).min(1).max(10),
})

const scoutOutputSchema = z.object({
  candidates: z.array(candidateSchema).min(1).max(5),
  disclaimer:  z.string().min(10),
})

// ─── Sport module ─────────────────────────────────────────────
function getScoutSportModule(sport: string): string {
  switch (sport) {
    case 'tennis':
      return 'SPORT: TENNIS — Scout factors: surface + player preferences, H2H on surface, recent form, serve/return quality, format (BO3/BO5), schedule congestion, travel.'
    case 'soccer':
      return 'SPORT: SOCCER — Scout factors: home/away split, team form (last 5), motivation (title/relegation), key injuries, schedule congestion, H2H, market-specific indicators (xG for totals, aggression for cards).'
    case 'cs2':
      return 'SPORT: CS2 — Scout factors: map pool fit, format (BO1 high variance), LAN vs online, roster stability, recent map-specific form, pistol round win rate.'
    case 'basketball':
      return 'SPORT: BASKETBALL — Scout factors: pace matchup, home/away splits, back-to-back fatigue, injury impact on scoring/defense, recent ATS form, totals trends.'
    case 'ice_hockey':
      return 'SPORT: ICE HOCKEY — Scout factors: goaltender form and matchup, home ice, power play %, back-to-back, travel, H2H trends.'
    case 'mma':
      return 'SPORT: MMA — Scout factors: style matchup (grappler vs striker), reach/size differential, camp quality, recent finishes, judge-specific tendencies for decision bets.'
    default:
      return `SPORT: ${sport.toUpperCase()} — Evaluate all relevant factors. Flag when data is limited.`
  }
}

// ─── System prompt ─────────────────────────────────────────────
function buildScoutSystemPrompt(sport: string, outputLanguage: string, webSearchEnabled: boolean): string {
  const langInstruction = outputLanguage === 'auto'
    ? 'Respond in the same language the user writes in. If unclear, use English.'
    : `All user-facing text (reasoning, required_checks, disclaimer) must be in: ${outputLanguage}. JSON field names and enum values (opportunity_type, risk_level, and all other keys) must remain in English exactly as specified — do not translate them.`

  const dataDisclaimer = webSearchEnabled
    ? ''
    : `
DATA LIMITATION:
You do not have access to live data for this session. Your disclaimer MUST acknowledge: "This scout analysis is based on general knowledge and does not include live injury reports, current odds, recent form updates, or breaking news."`

  return `You are the Market Scout for BetTracker AI — a research discovery tool for serious bettors.

ROLE: Surface 1–5 upcoming sporting markets worth deeper analysis. You are NOT the AI Analyst — you discover candidates, you do not evaluate them.

LANGUAGE: ${langInstruction}
Structured JSON field values (opportunity_type, risk_level) must always be English canonical form.
Only reasoning, required_checks, and disclaimer should be in the user's language.

${getScoutSportModule(sport)}

SCOUT RULES (non-negotiable):
- Return 1–5 candidates. Do not pad with weak candidates — quality over quantity.
- Every candidate MUST have at least 1 required_check (specific, actionable verification step).
- scout_score is NOT a win probability. It measures how worthwhile this market is to research (0–100).
- confidence_score reflects your confidence in the quality of this analysis (not the outcome).
- Without live data, confidence_score should honestly be in the range 30–60.
- If fewer than 3 strong candidates exist, return fewer — honesty over padding.
- NEVER use: "guaranteed", "sure bet", "lock", "100%", "must bet", "all-in", "chase", "recover your loss", "free money"
- NEVER guarantee outcomes or profits.
- Skipping markets with low research value is the right call.
${dataDisclaimer}

OPPORTUNITY TYPES:
- "value" — market appears to underestimate the selection's probability based on known factors
- "contrarian" — public/market sentiment appears to be creating a pricing inefficiency
- "pattern" — historical patterns (form, H2H, schedule, surface) suggest a recurring edge
- "general" — worth researching but does not fit cleanly into the above types

OUTPUT FORMAT:
CRITICAL: Your response must start with { and end with }.
Do not write ANY text before or after the JSON object.
Do not write introductory sentences, summaries, or explanations.
The first character of your response must be { and the last must be }.
This applies regardless of the output language.

CRITICAL — ENUM VALUES: opportunity_type MUST be exactly one of: "value", "contrarian", "pattern", "general". risk_level MUST be exactly one of: "low", "medium", "high". These are code values — do NOT translate them into any language.

Return ONLY a valid JSON object (no markdown, no explanation outside JSON):
{
  "candidates": [
    {
      "event_name": <string — specific match/event name>,
      "market_type": <string — Match Winner / Total Goals / Handicap / etc.>,
      "selection": <string or null — which side/outcome>,
      "match_date": <YYYY-MM-DD string or null — the date this event takes place, if known>,
      "offered_odds": <number or null — if known>,
      "opportunity_type": <MUST be exactly one of: "value" | "contrarian" | "pattern" | "general" — do NOT translate>,
      "scout_score": <integer 0–100 — research worthiness, NOT win probability>,
      "model_probability": <number 0–100 — your probability estimate for this selection>,
      "implied_probability": <number or null — from offered_odds if available>,
      "edge_percent": <number or null — model_probability minus implied_probability>,
      "confidence_score": <integer 0–100 — your confidence in this analysis quality>,
      "risk_level": <MUST be exactly one of: "low" | "medium" | "high" — do NOT translate>,
      "reasoning": <string — 2–3 sentences explaining why this market is worth researching>,
      "required_checks": [<string — specific action user must take before betting>]
    }
  ],
  "disclaimer": <string — acknowledge data limitations honestly>
}`
}

// ─── Route handler ────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    // 1. Auth
    if (!process.env.ANTHROPIC_API_KEY) {
      console.error('[scout] ANTHROPIC_API_KEY is not set — scout requests will fail')
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    // 2. Parse + validate input (before rate-limit so sport is available for analytics)
    const body = await req.json()
    const parsed = requestSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid input', details: parsed.error.flatten() },
        { status: 400 },
      )
    }
    const input = parsed.data

    // 3. Rate limit
    const rl = checkRateLimit(user.id)
    if (!rl.allowed) {
      await trackServerEvent(user.id, EVENTS.SCOUT_RATE_LIMITED, {
        sport:       input.sport,
        retry_after: rl.retryAfter,
      })
      return NextResponse.json(
        { success: false, error: 'Rate limit exceeded. Try again later.' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
      )
    }

    const globalWebSearchEnabled = process.env.ANTHROPIC_WEB_SEARCH_ENABLED === 'true'
    const profileRes = await supabase.from('profiles').select('web_search_enabled').eq('id', user.id).single()
    const webSearchEnabled = globalWebSearchEnabled && (profileRes.data?.web_search_enabled ?? false)

    await trackServerEvent(user.id, EVENTS.SCOUT_STARTED, {
      sport:              input.sport,
      timeframe:          input.timeframe,
      has_context:        !!input.context,
      web_search_enabled: webSearchEnabled,
    })

    // 4. Build prompt
    const TIMEFRAME_LABEL: Record<string, string> = {
      today:     'today',
      tomorrow:  'tomorrow',
      this_week: 'this week',
      custom:    '',
    }
    const userMessage = `Find sporting markets worth researching ${TIMEFRAME_LABEL[input.timeframe] ?? ''}.

Sport: ${input.sport}
Context: ${input.context}

Return 1–5 research candidates as JSON only. No markdown, no explanation outside the JSON.`

    // 5. Claude call with timeout and optional web search fallback
    const model = process.env.ANTHROPIC_MODEL_SCOUT ?? process.env.ANTHROPIC_MODEL_ANALYST ?? 'claude-sonnet-4-6'
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    const buildCallParams = (withWebSearch: boolean) => {
      const tools = withWebSearch
        ? ([{ type: 'web_search_20250305', name: 'web_search' }] as unknown as Anthropic.Tool[])
        : []
      return {
        model,
        max_tokens: 2_000,
        system: buildScoutSystemPrompt(input.sport, input.output_language, withWebSearch),
        messages: [{ role: 'user' as const, content: userMessage }],
        ...(tools.length > 0 && { tools }),
      }
    }

    let message!: Anthropic.Message
    let webSearchActuallyUsed = false
    let fallbackUsed = false

    try {
      message = await callClaudeWithTimeout(
        (signal) => anthropic.messages.create(buildCallParams(webSearchEnabled), { signal }) as Promise<Anthropic.Message>,
        webSearchEnabled ? TIMEOUT_WITH_WEB_SEARCH_MS : TIMEOUT_WITHOUT_WEB_SEARCH_MS,
      )
      webSearchActuallyUsed = webSearchEnabled && message.content.some(b => b.type !== 'text')
    } catch (err) {
      if (webSearchEnabled) {
        const firstError = classifyAnthropicError(err)
        console.warn('[scout] web-search call failed, attempting fallback without web search:', firstError.type)

        await trackServerEvent(user.id, EVENTS.SCOUT_WEB_SEARCH_FALLBACK, {
          sport:          input.sport,
          original_error: firstError.type,
        })

        try {
          message = await callClaudeWithTimeout(
            (signal) => anthropic.messages.create(buildCallParams(false), { signal }) as Promise<Anthropic.Message>,
            TIMEOUT_WITHOUT_WEB_SEARCH_MS,
          )
          webSearchActuallyUsed = false
          fallbackUsed = true
        } catch (fallbackErr) {
          const fallbackError = classifyAnthropicError(fallbackErr)
          console.error('[scout] fallback also failed:', fallbackError.type, fallbackErr instanceof Error ? fallbackErr.name : typeof fallbackErr)
          await trackServerEvent(user.id, EVENTS.SCOUT_FAILED, {
            sport:              input.sport,
            error_type:         fallbackError.type,
            fallback_attempted: true,
            original_error:     firstError.type,
            fallback_error:     fallbackError.type,
          })
          return NextResponse.json(
            { success: false, error: 'Scout is temporarily unavailable. Please try again.' },
            { status: fallbackError.status },
          )
        }
      } else {
        const classified = classifyAnthropicError(err)
        console.error('[scout] call failed:', classified.type, err instanceof Error ? err.name : typeof err)
        await trackServerEvent(user.id, EVENTS.SCOUT_FAILED, {
          sport:      input.sport,
          error_type: classified.type,
        })
        return NextResponse.json(
          { success: false, error: classified.message },
          { status: classified.status },
        )
      }
    }

    // Extract last text block (web search may produce multiple content blocks)
    const rawText = message.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text)
      .at(-1) ?? ''

    // 6. Parse + validate output
    let scoutRaw: unknown
    try {
      const clean = extractJsonObject(rawText)
      scoutRaw = JSON.parse(clean)
    } catch {
      await trackServerEvent(user.id, EVENTS.SCOUT_FAILED, { sport: input.sport, error_type: 'anthropic_invalid_json', output_language: input.output_language })
      return NextResponse.json(
        { success: false, error: 'Scout returned invalid JSON. Please try again.' },
        { status: 502 },
      )
    }

    const validated = scoutOutputSchema.safeParse(scoutRaw)
    if (!validated.success) {
      await trackServerEvent(user.id, EVENTS.SCOUT_FAILED, { sport: input.sport, error_type: 'anthropic_schema_mismatch' })
      return NextResponse.json(
        { success: false, error: 'Scout output did not match expected schema. Please try again.' },
        { status: 502 },
      )
    }

    // 7. Server-side implied_probability + edge_percent override when offered_odds is present
    const rows = validated.data.candidates.map(c => {
      const offered = c.offered_odds ?? null
      const implied = offered != null
        ? parseFloat(((1 / offered) * 100).toFixed(2))
        : (c.implied_probability ?? null)
      const edge = offered != null && c.model_probability != null
        ? parseFloat((c.model_probability - (1 / offered) * 100).toFixed(2))
        : (c.edge_percent ?? null)

      return {
        user_id:             user.id,
        sport_code:          input.sport,
        event_name:          c.event_name,
        market_type:         c.market_type,
        selection:           c.selection ?? null,
        match_date:          c.match_date ?? null,
        offered_odds:        offered,
        opportunity_type:    c.opportunity_type,
        scout_score:         c.scout_score,
        model_probability:   c.model_probability,
        implied_probability: implied,
        edge_percent:        edge,
        confidence_score:    c.confidence_score,
        risk_level:          c.risk_level,
        status:              'discovered',
        reasoning:           c.reasoning,
        required_checks:     c.required_checks,
        web_search_used:     webSearchActuallyUsed,
        scout_run_input: {
          sport:     input.sport,
          context:   input.context,
          timeframe: input.timeframe,
        },
      }
    })

    // 8. Batch insert — all or nothing
    const { data: inserted, error: insertErr } = await supabase
      .from('market_opportunities')
      .insert(rows)
      .select()

    if (insertErr) {
      await trackServerEvent(user.id, EVENTS.SCOUT_FAILED, { sport: input.sport, error_type: 'persist' })
      return NextResponse.json(
        { success: false, error: `Scout succeeded but failed to persist: ${insertErr.message}` },
        { status: 500 },
      )
    }

    await trackServerEvent(user.id, EVENTS.SCOUT_COMPLETED, {
      sport:           input.sport,
      candidate_count: inserted?.length ?? 0,
      web_search_used: webSearchActuallyUsed,
      fallback_used:   fallbackUsed,
      score_buckets:   rows.map(r => bucketScoutScore(r.scout_score ?? 0)),
    })

    const fallbackLimitation = 'Live web-search context was unavailable, so Scout used limited-data mode. Verify current odds, injuries/news, line movement, and recent form before making any decision.'
    const responseDisclaimer = fallbackUsed
      ? `${validated.data.disclaimer}\n\n${fallbackLimitation}`
      : validated.data.disclaimer

    return NextResponse.json({
      success: true,
      data: {
        opportunities:   inserted ?? [],
        web_search_used: webSearchActuallyUsed,
        fallback_used:   fallbackUsed,
        disclaimer:      responseDisclaimer,
      },
    })

  } catch (err: unknown) {
    console.error('[scout] unhandled error:', err instanceof Error ? err.name : 'unknown')
    return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500 })
  }
}
