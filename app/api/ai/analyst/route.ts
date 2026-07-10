import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { trackServerEvent } from '@/lib/analytics/server'
import { EVENTS } from '@/lib/analytics/events'
import { bucketOdds, bucketConfidence } from '@/lib/analytics/buckets'
import { extractJsonObject } from '@/lib/ai/extract-json'
import {
  buildAnalystPricingPayload,
  buildAnalystTrustPayload,
  evaluateAnalysisQuality,
  type AnalysisLegQualityInput,
  type SportModuleSupport,
} from '@/lib/ai/analysis-quality-gate'

import { enforceRateLimit, RATE_LIMITS } from '@/lib/rate-limit'

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
  legs: z.array(z.object({
    rawText:          z.string().max(500).nullable().optional(),
    eventName:        z.string().max(500).nullable().optional(),
    marketType:       z.string().max(500).nullable().optional(),
    selection:        z.string().max(200).nullable().optional(),
    odds:             z.number().min(1.01).max(1000).nullable().optional(),
    sport:            z.enum(SPORTS).nullable().optional(),
    isLive:           z.boolean().optional(),
    periodOrPhase:    z.string().max(80).nullable().optional(),
    statusText:       z.string().max(120).nullable().optional(),
    scoreText:        z.string().max(80).nullable().optional(),
    statusSource:     z.enum(['coupon', 'provider', 'unknown']).optional(),
    statusConfidence: z.number().min(0).max(1).nullable().optional(),
  })).max(20).optional(),
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

function normalizeAnalystRaw(raw: unknown): unknown {
  if (raw && typeof raw === 'object') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const o = raw as Record<string, any>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lc = (v: any) => typeof v === 'string' ? v.toLowerCase().trim() : v
    o.risk_level     = lc(o.risk_level)
    o.recommendation = lc(o.recommendation)
  }
  return raw
}

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

function getAnalystSportSupport(sport: string): SportModuleSupport {
  return ['soccer', 'tennis', 'cs2'].includes(sport) ? 'full' : 'none'
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

    // 2. Rate limit (durable, cross-instance — Decision #052)
    const rl = await enforceRateLimit(`analyst:${user.id}`, RATE_LIMITS.analyst())
    if (rl.unavailable) {
      return NextResponse.json(
        { success: false, error: 'Service temporarily unavailable. Try again shortly.' },
        { status: 503 }
      )
    }
    if (!rl.allowed) {
      return NextResponse.json(
        { success: false, error: 'Rate limit exceeded. Try again later.' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfter || 60) } }
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

    await trackServerEvent(user.id, EVENTS.AI_ANALYSIS_STARTED, {
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

    const rawText = message.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text)
      .at(-1) ?? ''
    const inputChars  = userMessage.length + systemPrompt.length
    const outputChars = rawText.length

    // 7. Parse + validate output
    let analysisRaw: unknown
    try {
      analysisRaw = JSON.parse(extractJsonObject(rawText))
    } catch {
      await trackServerEvent(user.id, EVENTS.AI_ANALYSIS_FAILED, { sport: input.sport, error_type: 'ai_parse' })
      return NextResponse.json(
        { success: false, error: 'AI returned invalid JSON. Please try again.' },
        { status: 502 }
      )
    }

    const validated = analysisSchema.safeParse(normalizeAnalystRaw(analysisRaw))
    if (!validated.success) {
      console.error('[analyst] schema_mismatch', {
        issueCount: validated.error.issues.length,
        issues: validated.error.issues.map(i => ({ path: i.path, code: i.code, message: i.message })),
        outputChars: rawText.length,
      })
      await trackServerEvent(user.id, EVENTS.AI_ANALYSIS_FAILED, { sport: input.sport, error_type: 'ai_schema' })
      return NextResponse.json(
        { success: false, error: 'AI output did not match expected schema. Please try again.' },
        { status: 502 }
      )
    }

    const analysis = validated.data

    // 8. Server owns pricing, but the quality gate can suppress it entirely.
    const qualityGate = evaluateAnalysisQuality({
      sport:              input.sport,
      eventName:          input.event_name,
      marketType:         input.market_type,
      selection:          input.selection ?? null,
      notes:              input.notes ?? null,
      webSearchEnabled,
      modelProbability:   analysis.model_probability,
      modelInputsPresent: false,
      sportModuleSupport: getAnalystSportSupport(input.sport),
      legs:               input.legs as AnalysisLegQualityInput[] | undefined,
    })
    const gatedPricing = buildAnalystPricingPayload({
      qualityGate,
      modelProbability: analysis.model_probability,
      offeredOdds:      input.offered_odds,
      recommendation:   analysis.recommendation,
      riskLevel:        analysis.risk_level,
    })
    const trustPayload = buildAnalystTrustPayload({
      qualityGate,
      locale:       input.output_language,
      eventName:    input.event_name,
      marketType:   input.market_type,
      selection:    input.selection ?? null,
      rawReasoning: analysis.reasoning,
      rawFactors:   analysis.factors,
    })

    // 9. Sprint 2: always include honesty disclaimer
    const honestDisclaimer = input.output_language === 'uk'
      ? 'Цей аналіз базується лише на наданій інформації та не включає актуальні травми, новини команд, оновлення поточної форми або поточний рух лінії.'
      : 'This analysis is based only on the information provided and does not include live injuries, team news, recent form updates, or current line movement.'
    const safeDisclaimer = qualityGate.pricingAllowed
      ? analysis.disclaimer || honestDisclaimer
      : trustPayload.trust_view.uiDisclaimer
    analysis.disclaimer = safeDisclaimer

    // 10. Persist decision immediately — every Analyst call creates a decision + ai_analysis_run
    const inputSnapshot = {
      sport:        input.sport,
      event_name:   input.event_name,
      market_type:  input.market_type,
      selection:    input.selection ?? null,
      line:         input.line ?? null,
      offered_odds: input.offered_odds,
      bookmaker:    input.bookmaker ?? null,
      legs:         input.legs ?? null,
    }
    const outputJson = {
      model_probability:   gatedPricing.model_probability,
      implied_probability: gatedPricing.implied_probability,
      edge_percent:        gatedPricing.edge_percent,
      confidence_score:    analysis.confidence_score,
      risk_level:          gatedPricing.risk_level,
      recommendation:      gatedPricing.recommendation,
      reasoning:           trustPayload.reasoning,
      factors:             trustPayload.factors,
      disclaimer:          safeDisclaimer,
      quality_gate:        qualityGate,
      trust_view:          trustPayload.trust_view,
    }

    // Decision #048: persistence is server-only. The user client above
    // authenticated the session and ran the FP-001 quality gate; the write
    // goes through persist_analysis_decision (service_role EXECUTE only)
    // with the user id derived from that session — never from the body.
    // The user-callable create_decision_with_analysis loses EXECUTE in
    // migration 018, closing the gate-bypass surface.
    const adminClient = createAdminClient()
    const { data: rpcData, error: rpcErr } = await adminClient.rpc('persist_analysis_decision', {
      p_user_id:             user.id,
      p_sport:               input.sport,
      p_event_name:          input.event_name,
      p_market_type:         input.market_type,
      p_selection:           input.selection ?? null,
      p_line:                input.line ?? null,
      p_offered_odds:        input.offered_odds,
      p_bookmaker:           input.bookmaker ?? null,
      p_output_language:     input.output_language === 'auto' ? null : input.output_language,
      p_model_probability:   gatedPricing.model_probability,
      p_implied_probability: gatedPricing.implied_probability,
      p_edge_percent:        gatedPricing.edge_percent,
      p_confidence_score:    analysis.confidence_score,
      p_risk_level:          gatedPricing.risk_level,
      p_recommendation:      gatedPricing.recommendation,
      p_reasoning:           trustPayload.reasoning,
      p_factors:             trustPayload.factors,
      p_model_name:          model,
      p_input_snapshot:      inputSnapshot,
      p_output_json:         outputJson,
      p_web_search_used:     false,
      p_input_chars:         inputChars,
      p_output_chars:        outputChars,
    })

    if (rpcErr) {
      console.error('[analyst] persist error:', rpcErr.message)
      await trackServerEvent(user.id, EVENTS.AI_ANALYSIS_FAILED, { sport: input.sport, error_type: 'persist' })
      return NextResponse.json(
        { success: false, error: 'Analysis succeeded but failed to persist' },
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
        recommendation:    gatedPricing.recommendation,
        risk_level:        gatedPricing.risk_level,
        edge_bucket:       gatedPricing.edge_bucket,
        confidence_bucket: bucketConfidence(analysis.confidence_score),
        odds_bucket:       bucketOdds(input.offered_odds),
        decision_id:       decisionId,
      }),
      trackServerEvent(user.id, EVENTS.DECISION_CREATED, {
        decision_id:    decisionId,
        sport:          input.sport,
        recommendation: gatedPricing.recommendation,
        risk_level:     gatedPricing.risk_level,
      }),
    ])

    return NextResponse.json({
      success: true,
      data: {
        decision_id:      decisionId,
        analysis_run_id:  analysisRunId ?? null,
        // AI output (server-corrected implied + edge)
        model_probability:   gatedPricing.model_probability,
        implied_probability: gatedPricing.implied_probability,
        edge_percent:        gatedPricing.edge_percent,
        confidence_score:    analysis.confidence_score,
        risk_level:          gatedPricing.risk_level,
        recommendation:      gatedPricing.recommendation,
        reasoning:           trustPayload.reasoning,
        factors:             trustPayload.factors,
        disclaimer:          safeDisclaimer,
        quality_gate:        qualityGate,
        trust_view:          trustPayload.trust_view,
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

