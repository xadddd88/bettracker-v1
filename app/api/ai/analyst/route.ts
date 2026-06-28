import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { trackServerEvent } from '@/lib/analytics/server'
import { EVENTS } from '@/lib/analytics/events'
import { bucketOdds, bucketEdge, bucketConfidence } from '@/lib/analytics/buckets'

// ─── Rate limit store (in-memory, Sprint 2) ──────────────────
// Sprint 3: replace with Redis
const rateLimitStore = new Map<string, { minute: number; day: number; minuteTs: number; dayTs: number }>()

const RATE_LIMIT_PER_MINUTE = 10
const RATE_LIMIT_PER_DAY    = 50

function checkRateLimit(userId: string): { allowed: boolean; retryAfter?: number } {
  const now = Date.now()
  const minuteWindow = 60_000
  const dayWindow    = 86_400_000

  const entry = rateLimitStore.get(userId) ?? {
    minute: 0, day: 0,
    minuteTs: now, dayTs: now,
  }

  // Reset minute counter if window passed
  if (now - entry.minuteTs > minuteWindow) {
    entry.minute = 0
    entry.minuteTs = now
  }
  // Reset day counter if window passed
  if (now - entry.dayTs > dayWindow) {
    entry.day = 0
    entry.dayTs = now
  }

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

// ─── Zod schemas ─────────────────────────────────────────────
const SPORTS = ['tennis', 'soccer', 'cs2', 'basketball', 'ice_hockey', 'mma', 'other'] as const
const LOCALES = ['auto', 'uk', 'ru', 'en', 'es', 'fr', 'de', 'ar'] as const

const requestSchema = z.object({
  sport:           z.enum(SPORTS),
  event_name:      z.string().min(1).max(500),
  market_type:     z.string().min(1).max(500),
  selection:       z.string().max(200).optional(),
  line:            z.number().optional(),
  offered_odds:    z.number().min(1.01).max(1000),
  bookmaker:       z.string().max(100).optional(),
  notes:           z.string().max(1000).optional(),
  output_language: z.enum(LOCALES).default('auto'),
})

const factorSchema = z.object({
  name:   z.string(),
  score:  z.number().min(-3).max(3),
  detail: z.string(),
})

const analysisSchema = z.object({
  model_probability:    z.number().min(0).max(100),
  implied_probability:  z.number().min(0).max(100),
  edge_percent:         z.number().min(-100).max(100),
  confidence_score:     z.number().min(0).max(100),
  risk_level:           z.enum(['low', 'medium', 'high']),
  recommendation:       z.enum(['bet', 'skip', 'watch', 'no_value']),
  reasoning:            z.string().min(10),
  factors:              z.array(factorSchema).min(4).max(12),
  disclaimer:           z.string().optional(),
})

// ─── Sport modules ────────────────────────────────────────────
function getSportModule(sport: string): string {
  switch (sport) {
    case 'tennis':
      return `
SPORT MODULE: TENNIS
Key factors to evaluate:
- Surface (hard / clay / grass) and player surface preferences
- Serve quality (ace rate, 1st serve %, service hold rate)
- Return quality (break point conversion)
- H2H record, especially on this surface
- Recent form (last 5 matches)
- Indoor vs outdoor if relevant
- Format: Best of 3 or Best of 5 (affects variance and fatigue)
- Physical fatigue (schedule congestion, travel)
- Injury risk indicators if mentioned
- Tie-break frequency and performance
Apply these factors proportionally to the market. For total games markets, weight score on serve heavily.`

    case 'soccer':
      return `
SPORT MODULE: SOCCER
Key factors to evaluate:
- Home/away split (league average and team-specific)
- Team style (possession / counter / pressing)
- Expected Goals (xG) if context provided; otherwise use form and style
- Recent form (last 5 matches, weight recent more)
- Injuries and suspensions if mentioned
- Lineups if provided
- Motivation (title race, relegation, cup priority)
- Schedule congestion (midweek fixture effect)
- H2H if relevant
- Tactical matchup
Apply factors to the specific market: for cards/corners markets, weight fouls, referee style, team aggression.`

    case 'cs2':
      return `
SPORT MODULE: CS2
Key factors to evaluate:
- Map pool and map veto dynamics
- Format: BO1, BO3, or BO5 (BO1 is high variance)
- LAN vs online performance split
- Roster stability (recent changes, stand-ins)
- Player form (recent rating data if provided)
- CT side vs T side strength
- Pistol round win rate
- Economy control and force-buy tendencies
- H2H record, especially per map
- Recent map-specific form
Weight map selection as the most impactful factor in CS2 analysis.`

    default:
      return `
SPORT MODULE: GENERIC
Evaluate all relevant factors for this sport and market.
Consider: form, head-to-head, contextual motivation, market-specific indicators.
Be explicit when data is limited.`
  }
}

// ─── System prompt ────────────────────────────────────────────
function buildSystemPrompt(sport: string, outputLanguage: string, webSearchEnabled: boolean): string {
  const sportModule = getSportModule(sport)
  const langInstruction = outputLanguage === 'auto'
    ? 'Respond in the same language the user writes in. If unclear, use English.'
    : `Respond in this language for all user-facing text: ${outputLanguage}. Reasoning and factors must be in ${outputLanguage}.`

  const disclaimer = webSearchEnabled
    ? ''
    : `
HONESTY REQUIREMENT:
You do not have access to live data for this analysis.
You MUST include this exact sentence in your disclaimer field:
"This analysis is based only on the information provided and does not include live injuries, team news, recent form updates, or current line movement."`

  return `You are the AI Analyst for BetTracker AI — a decision-making tool for serious bettors.
Your role is to evaluate betting decisions with structured, honest analysis.

LANGUAGE: ${langInstruction}
Structured JSON field values (risk_level, recommendation, etc.) must always be in English canonical form.
Only reasoning, factors.detail, and disclaimer should be in the user's language.

${sportModule}

RESPONSIBLE BETTING RULES (non-negotiable):
- NEVER use: "guaranteed", "sure bet", "lock", "100%", "must bet", "all-in", "chase", "recover your loss", "free money"
- NEVER guarantee outcomes
- ALWAYS explain uncertainty
- ALWAYS treat "skip" as a valid, positive outcome
- If edge is negative or marginal, use recommendation = "no_value" or "skip"
- Do not encourage increasing stake aggressively
- Confidence score must honestly reflect your certainty — do not inflate it
${disclaimer}

OUTPUT FORMAT:
Return ONLY a valid JSON object matching this exact schema (no markdown, no explanation outside JSON):
{
  "model_probability": <number 0-100, your estimated win probability>,
  "implied_probability": <number 0-100, calculated from offered_odds as (1/odds)*100>,
  "edge_percent": <model_probability minus implied_probability>,
  "confidence_score": <number 0-100, your confidence in this analysis>,
  "risk_level": <"low" | "medium" | "high">,
  "recommendation": <"bet" | "skip" | "watch" | "no_value">,
  "reasoning": <string, 2-4 sentences in user's language explaining the recommendation>,
  "factors": [
    { "name": <factor name in user's language>, "score": <-3 to +3>, "detail": <1-2 sentences> },
    ... (minimum 6 factors, maximum 10)
  ],
  "disclaimer": <string or null — required if no live data>
}`
}

// ─── Route handler ────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    // 1. Auth
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    // 2. Rate limit
    const rl = checkRateLimit(user.id)
    if (!rl.allowed) {
      return NextResponse.json(
        { success: false, error: 'Rate limit exceeded. Try again later.' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } }
      )
    }

    // 3. Parse + validate input
    const body = await req.json()
    const parsed = requestSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid input', details: parsed.error.flatten() },
        { status: 400 }
      )
    }
    const input = parsed.data

    // 4. Sprint 2: real web search not implemented — always false
    const webSearchEnabled = false

    void trackServerEvent(user.id, EVENTS.AI_ANALYSIS_STARTED, {
      sport:          input.sport,
      odds_bucket:    bucketOdds(input.offered_odds),
      has_bookmaker:  !!input.bookmaker,
      has_notes:      !!input.notes,
      language:       input.output_language,
    })

    // 5. Build prompt
    const systemPrompt = buildSystemPrompt(input.sport, input.output_language, webSearchEnabled)
    const implied = parseFloat(((1 / input.offered_odds) * 100).toFixed(2))

    const userMessage = `Analyze this betting opportunity:

Sport: ${input.sport}
Event: ${input.event_name}
Market: ${input.market_type}${input.selection ? `\nSelection: ${input.selection}` : ''}${input.line != null ? `\nLine: ${input.line}` : ''}
Offered odds: ${input.offered_odds} (implied probability: ${implied}%)${input.bookmaker ? `\nBookmaker: ${input.bookmaker}` : ''}${input.notes ? `\nAdditional context: ${input.notes}` : ''}

Return structured JSON analysis only.`

    // 6. Claude call
    const model = process.env.ANTHROPIC_MODEL_ANALYST ?? 'claude-sonnet-4-6'
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    const message = await anthropic.messages.create({
      model,
      max_tokens: 1500,
      messages: [{ role: 'user', content: userMessage }],
      system: systemPrompt,
    })

    const rawText = message.content[0].type === 'text' ? message.content[0].text : ''
    const inputChars  = userMessage.length + systemPrompt.length
    const outputChars = rawText.length

    // 7. Parse + validate output
    let analysisRaw: unknown
    try {
      // Strip markdown fences if present
      const clean = rawText.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim()
      analysisRaw = JSON.parse(clean)
    } catch {
      await trackServerEvent(user.id, EVENTS.AI_ANALYSIS_FAILED, { sport: input.sport, error_type: 'ai_parse' })
      return NextResponse.json(
        { success: false, error: 'AI returned invalid JSON. Please try again.' },
        { status: 502 }
      )
    }

    const validated = analysisSchema.safeParse(analysisRaw)
    if (!validated.success) {
      await trackServerEvent(user.id, EVENTS.AI_ANALYSIS_FAILED, { sport: input.sport, error_type: 'ai_schema' })
      return NextResponse.json(
        { success: false, error: 'AI output did not match expected schema. Please try again.' },
        { status: 502 }
      )
    }

    const analysis = validated.data

    // 8. Server owns implied_probability and edge_percent — override AI values
    const serverImplied = parseFloat(((1 / input.offered_odds) * 100).toFixed(2))
    const serverEdge    = parseFloat((analysis.model_probability - serverImplied).toFixed(2))
    analysis.implied_probability = serverImplied
    analysis.edge_percent        = serverEdge

    // 9. Sprint 2: always include honesty disclaimer
    const honestDisclaimer = 'This analysis is based only on the information provided and does not include live injuries, team news, recent form updates, or current line movement.'
    if (!analysis.disclaimer) analysis.disclaimer = honestDisclaimer

    // 10. Persist decision immediately — every Analyst call creates a decision + ai_analysis_run
    const inputSnapshot = {
      sport:        input.sport,
      event_name:   input.event_name,
      market_type:  input.market_type,
      selection:    input.selection ?? null,
      line:         input.line ?? null,
      offered_odds: input.offered_odds,
      bookmaker:    input.bookmaker ?? null,
    }
    const outputJson = {
      model_probability:   analysis.model_probability,
      implied_probability: serverImplied,
      edge_percent:        serverEdge,
      confidence_score:    analysis.confidence_score,
      risk_level:          analysis.risk_level,
      recommendation:      analysis.recommendation,
      reasoning:           analysis.reasoning,
      factors:             analysis.factors,
      disclaimer:          analysis.disclaimer,
    }

    const { data: rpcData, error: rpcErr } = await supabase.rpc('create_decision_with_analysis', {
      p_sport:               input.sport,
      p_event_name:          input.event_name,
      p_market_type:         input.market_type,
      p_selection:           input.selection ?? null,
      p_line:                input.line ?? null,
      p_offered_odds:        input.offered_odds,
      p_bookmaker:           input.bookmaker ?? null,
      p_output_language:     input.output_language === 'auto' ? null : input.output_language,
      p_model_probability:   analysis.model_probability,
      p_implied_probability: serverImplied,
      p_edge_percent:        serverEdge,
      p_confidence_score:    analysis.confidence_score,
      p_risk_level:          analysis.risk_level,
      p_recommendation:      analysis.recommendation,
      p_reasoning:           analysis.reasoning,
      p_factors:             analysis.factors,
      p_model_name:          model,
      p_input_snapshot:      inputSnapshot,
      p_output_json:         outputJson,
      p_web_search_used:     false,
      p_input_chars:         inputChars,
      p_output_chars:        outputChars,
    })

    if (rpcErr) {
      console.error('[analyst] persist error:', rpcErr)
      await trackServerEvent(user.id, EVENTS.AI_ANALYSIS_FAILED, { sport: input.sport, error_type: 'persist' })
      return NextResponse.json(
        { success: false, error: `Analysis succeeded but failed to persist: ${rpcErr.message}` },
        { status: 500 }
      )
    }

    const rpcPayload = rpcData as { decision_id?: string; analysis_run_id?: string } | null
    const decisionId     = rpcPayload?.decision_id
    const analysisRunId  = rpcPayload?.analysis_run_id
    if (!decisionId) {
      await trackServerEvent(user.id, EVENTS.AI_ANALYSIS_FAILED, { sport: input.sport, error_type: 'persist' })
      return NextResponse.json(
        { success: false, error: 'Decision persisted but returned no ID' },
        { status: 500 }
      )
    }

    await Promise.all([
      trackServerEvent(user.id, EVENTS.AI_ANALYSIS_COMPLETED, {
        sport:             input.sport,
        recommendation:    analysis.recommendation,
        risk_level:        analysis.risk_level,
        edge_bucket:       bucketEdge(serverEdge),
        confidence_bucket: bucketConfidence(analysis.confidence_score),
        odds_bucket:       bucketOdds(input.offered_odds),
        decision_id:       decisionId,
      }),
      trackServerEvent(user.id, EVENTS.DECISION_CREATED, {
        decision_id:    decisionId,
        sport:          input.sport,
        recommendation: analysis.recommendation,
        risk_level:     analysis.risk_level,
      }),
    ])

    return NextResponse.json({
      success: true,
      data: {
        decision_id:      decisionId,
        analysis_run_id:  analysisRunId ?? null,
        // AI output (server-corrected implied + edge)
        model_probability:   analysis.model_probability,
        implied_probability: serverImplied,
        edge_percent:        serverEdge,
        confidence_score:    analysis.confidence_score,
        risk_level:          analysis.risk_level,
        recommendation:      analysis.recommendation,
        reasoning:           analysis.reasoning,
        factors:             analysis.factors,
        disclaimer:          analysis.disclaimer,
        // Input context echoed back (for UI display, PDF, share)
        sport:           input.sport,
        event_name:      input.event_name,
        market_type:     input.market_type,
        selection:       input.selection ?? null,
        line:            input.line ?? null,
        offered_odds:    input.offered_odds,
        bookmaker:       input.bookmaker ?? null,
        output_language: input.output_language,
      },
    })

  } catch (err: unknown) {
    console.error('[analyst]', err)
    const msg = err instanceof Error ? err.message : 'Internal error'
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}

