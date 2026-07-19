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
import {
  alignAnalystResearchBriefToCoupon,
  buildAnalystResearchMessage,
  completePausedAnthropicTurn,
  containsAnalystPricingClaim,
  extractAnalystResearchSources,
  usedSuccessfulWebSearch,
  type AnalystResearchBrief,
} from '@/lib/ai/analyst-research'

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
  coupon_event_time: z.string().max(120).optional(),
  client_timezone: z.string().max(80).optional(),
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

const fixtureStatusSchema = z.enum([
  'scheduled', 'unknown', 'live', 'finished', 'cancelled', 'abandoned',
  'postponed', 'retired', 'walkover', 'not_bettable',
])

const researchCoverageSchema = z.object({
  live_injuries: z.boolean(),
  team_news: z.boolean(),
  recent_form: z.boolean(),
  line_movement: z.boolean(),
})

const researchBriefSchema = z.object({
  headline: z.string().min(5).max(180),
  summary: z.string().min(20).max(2_500),
  builder_risk: z.string().max(1_500).nullable(),
  verdict: z.string().min(10).max(1_500),
  data_gaps: z.array(z.string().min(2).max(300)).max(12),
  legs: z.array(z.object({
    leg_number: z.number().int().min(1).max(20),
    event_name: z.string().min(1).max(500),
    market_type: z.string().min(1).max(500),
    selection: z.string().max(200).nullable(),
    assessment: z.string().min(10).max(1_500),
    evidence: z.array(z.string().min(2).max(500)).max(8),
    risks: z.array(z.string().min(2).max(500)).max(8),
    fixture_status: fixtureStatusSchema,
    coverage: researchCoverageSchema,
  })).min(1).max(20),
}).optional()

const analysisSchema = z.object({
  model_probability:    z.number().min(0).max(100).nullable(),
  implied_probability:  z.number().min(0).max(100).nullable(),
  edge_percent:         z.number().min(-100).max(100).nullable(),
  confidence_score:     z.number().min(0).max(100),
  risk_level:           z.enum(['low', 'medium', 'high']),
  recommendation:       z.enum(['bet', 'skip', 'watch', 'no_value']),
  reasoning:            z.string().min(10),
  factors:              z.array(factorSchema).min(4).max(12),
  research_brief:       researchBriefSchema,
  disclaimer:           z.string().nullable().optional(),
})

type ResearchBriefOutput = NonNullable<z.infer<typeof researchBriefSchema>>

function toResearchBrief(value: ResearchBriefOutput): AnalystResearchBrief {
  return {
    headline: value.headline,
    summary: value.summary,
    builderRisk: value.builder_risk,
    verdict: value.verdict,
    dataGaps: value.data_gaps,
    legs: value.legs.map(leg => ({
      legNumber: leg.leg_number,
      eventName: leg.event_name,
      marketType: leg.market_type,
      selection: leg.selection,
      assessment: leg.assessment,
      evidence: leg.evidence,
      risks: leg.risks,
      fixtureStatus: leg.fixture_status,
      dataCoverage: {
        liveInjuries: leg.coverage.live_injuries,
        teamNews: leg.coverage.team_news,
        recentForm: leg.coverage.recent_form,
        lineMovement: leg.coverage.line_movement,
      },
    })),
  }
}

function buildFallbackResearchBrief(
  input: z.infer<typeof requestSchema>,
): AnalystResearchBrief {
  const suppliedLegs = input.legs?.length ? input.legs : [{
    eventName: input.event_name,
    marketType: input.market_type,
    selection: input.selection ?? null,
    sport: input.sport,
  }]
  return {
    headline: input.legs && input.legs.length > 1 ? 'Bet Builder requires leg-by-leg verification' : 'Market review requires verification',
    summary: 'The coupon structure was preserved, but the provider did not return the complete leg-by-leg research contract. No probability or edge is inferred from this fallback.',
    builderRisk: input.legs && input.legs.length > 1
      ? 'The legs share one match script and must not be treated as independent outcomes.'
      : null,
    verdict: 'Use this as a qualitative review only until the fixture and current evidence are verified.',
    dataGaps: ['Exact fixture status', 'Current team news and availability', 'Recent form and market movement'],
    legs: suppliedLegs.map((leg, index) => ({
      legNumber: index + 1,
      eventName: leg.eventName ?? input.event_name,
      marketType: leg.marketType ?? input.market_type,
      selection: leg.selection ?? null,
      assessment: 'This leg was preserved from the coupon, but the response did not contain enough sourced current evidence for a stronger conclusion.',
      evidence: [],
      risks: ['Fixture identity or status is not verified', 'Current market-specific inputs are incomplete'],
      fixtureStatus: leg.isLive ? 'live' : 'unknown',
      dataCoverage: {
        liveInjuries: false,
        teamNews: false,
        recentForm: false,
        lineMovement: false,
      },
    })),
  }
}

const ANALYST_TIMEOUT_MS = 60_000

async function callAnalystClaude(
  anthropic: Anthropic,
  params: Anthropic.MessageCreateParamsNonStreaming,
): Promise<Anthropic.Message> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ANALYST_TIMEOUT_MS)
  try {
    const continuationMessages = [...params.messages]
    const initial = await anthropic.messages.create(params, { signal: controller.signal })
    const collectedContent = [...initial.content]
    const completed = await completePausedAnthropicTurn(initial, async pausedContent => {
      continuationMessages.push({
        role: 'assistant',
        content: pausedContent as Anthropic.ContentBlockParam[],
      })
      const continuation = await anthropic.messages.create(
        { ...params, messages: continuationMessages },
        { signal: controller.signal },
      )
      collectedContent.push(...continuation.content)
      return continuation
    })
    return { ...completed, content: collectedContent }
  } finally {
    clearTimeout(timer)
  }
}

function isWebSearchConfigurationError(error: unknown): boolean {
  if (!(error instanceof Anthropic.BadRequestError)) return false
  const body = (() => {
    try { return JSON.stringify(error.error) } catch { return '' }
  })()
  return /web_search_20\d{6}|web[\s_-]+search(?:\s+tool)?/i.test(`${error.message} ${body}`)
}

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
    ? `
CURRENT-EVIDENCE REQUIREMENT:
- Use web search to identify the exact fixture and verify current facts.
- Cite only facts supported by returned sources. If the fixture is ambiguous, set fixture_status to "unknown".
- A successful search is not permission to invent model probabilities or line movement.`
    : `
HONESTY REQUIREMENT:
You do not have access to live data for this analysis.
You MUST include this exact sentence in your disclaimer field:
"This analysis is based only on the information provided and does not include live injuries, team news, recent form updates, or current line movement."`

  return `You are the AI Analyst for BetTracker AI — a decision-making tool for serious bettors.
Your role is to evaluate betting decisions with structured, honest analysis.

LANGUAGE: ${langInstruction}
Structured JSON field values (risk_level, recommendation, etc.) must always be in English canonical form.
All user-facing strings — reasoning, factors, research_brief, and disclaimer — must be in the user's language.

${sportModule}

RESPONSIBLE BETTING RULES (non-negotiable):
- NEVER use: "guaranteed", "sure bet", "lock", "100%", "must bet", "all-in", "chase", "recover your loss", "free money"
- NEVER guarantee outcomes
- ALWAYS explain uncertainty
- ALWAYS treat "skip" as a valid, positive outcome
- If edge is negative or marginal, use recommendation = "no_value" or "skip"
- Do not encourage increasing stake aggressively
- Confidence score must honestly reflect your certainty — do not inflate it

PRICING BOUNDARY:
- This route does not provide a calibrated probability model.
- Always return null for model_probability, implied_probability, and edge_percent.
- Do not state probability, edge, EV, or value as a number anywhere else in the response.
- Offered odds may be discussed only as the bookmaker's price, not proof of value.
${disclaimer}

OUTPUT FORMAT:
Return ONLY a valid JSON object matching this exact schema (no markdown, no explanation outside JSON):
{
  "model_probability": null,
  "implied_probability": null,
  "edge_percent": null,
  "confidence_score": <number 0-100, your confidence in this analysis>,
  "risk_level": <"low" | "medium" | "high">,
  "recommendation": <"bet" | "skip" | "watch" | "no_value">,
  "reasoning": <string, 2-4 sentences in user's language explaining the recommendation>,
  "factors": [
    { "name": <factor name in user's language>, "score": <-3 to +3>, "detail": <1-2 sentences> },
    ... (minimum 6 factors, maximum 10)
  ],
  "research_brief": {
    "headline": <concise conclusion in user's language>,
    "summary": <useful qualitative analysis; distinguish sourced facts from conditional reasoning>,
    "builder_risk": <for Bet Builder, explain dependence/correlation and shared match-script risk; otherwise null>,
    "verdict": <what the bettor should conclude or verify next, without inventing an edge>,
    "data_gaps": [<specific unresolved checks>],
    "legs": [
      {
        "leg_number": <1-based integer>,
        "event_name": <exact event for this leg>,
        "market_type": <exact market>,
        "selection": <exact selection or null>,
        "assessment": <what must happen and how robust/fragile this leg is>,
        "evidence": [<only verified or explicitly conditional evidence>],
        "risks": [<specific failure modes>],
        "fixture_status": <"scheduled" | "unknown" | "live" | "finished" | "cancelled" | "abandoned" | "postponed" | "retired" | "walkover" | "not_bettable">,
        "coverage": {
          "live_injuries": <true only if actually verified>,
          "team_news": <true only if actually verified>,
          "recent_form": <true only if actually verified>,
          "line_movement": <true only if actually verified>
        }
      }
    ]
  },
  "disclaimer": <string or null — required if no live data>
}

Every supplied coupon leg must appear exactly once in research_brief.legs, in the original order.
Do not collapse a Bet Builder into a single generic market. Analyze its legs separately, then their correlation.`
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

    // 4. Use the same explicit global + per-user search gate as Scout. A
    // failed profile read disables search; it never widens access.
    const globalWebSearchEnabled = process.env.ANTHROPIC_WEB_SEARCH_ENABLED === 'true'
    let webSearchEnabled = false
    if (globalWebSearchEnabled) {
      const profileRes = await supabase
        .from('profiles')
        .select('web_search_enabled')
        .eq('id', user.id)
        .single()
      webSearchEnabled = !profileRes.error && (profileRes.data?.web_search_enabled ?? false)
    }

    await trackServerEvent(user.id, EVENTS.AI_ANALYSIS_STARTED, {
      sport:          input.sport,
      odds_bucket:    bucketOdds(input.offered_odds),
      has_bookmaker:  !!input.bookmaker,
      has_notes:      !!input.notes,
      language:       input.output_language,
      web_search_enabled: webSearchEnabled,
    })

    // 5. Build prompt
    const systemPrompt = buildSystemPrompt(input.sport, input.output_language, webSearchEnabled)
    const userMessage = buildAnalystResearchMessage({
      sport: input.sport,
      eventName: input.event_name,
      marketType: input.market_type,
      selection: input.selection ?? null,
      line: input.line ?? null,
      offeredOdds: input.offered_odds,
      bookmaker: input.bookmaker ?? null,
      notes: input.notes ?? null,
      couponEventTime: input.coupon_event_time ?? null,
      clientTimezone: input.client_timezone ?? null,
      currentUtcIso: new Date().toISOString(),
      legs: input.legs,
    })

    // 6. Claude call
    const model = process.env.ANTHROPIC_MODEL_ANALYST ?? 'claude-sonnet-4-6'
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    const buildCallParams = (withWebSearch: boolean): Anthropic.MessageCreateParamsNonStreaming => ({
      model,
      max_tokens: 5_000,
      messages: [{ role: 'user', content: userMessage }],
      system: buildSystemPrompt(input.sport, input.output_language, withWebSearch),
      ...(withWebSearch && {
        tools: ([{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }] as unknown as Anthropic.Tool[]),
      }),
    })

    let message: Anthropic.Message
    let searchFallbackUsed = false
    try {
      message = await callAnalystClaude(anthropic, buildCallParams(webSearchEnabled))
    } catch (error) {
      // Only a request/configuration rejection is known to precede execution
      // and can be retried safely. Ambiguous timeout/network/5xx failures are
      // never automatically retried.
      if (webSearchEnabled && isWebSearchConfigurationError(error)) {
        searchFallbackUsed = true
        message = await callAnalystClaude(anthropic, buildCallParams(false))
      } else {
        throw error
      }
    }

    const webSearchActuallyUsed = !searchFallbackUsed && webSearchEnabled && usedSuccessfulWebSearch(message.content)
    const researchSources = extractAnalystResearchSources(message.content)

    const rawText = message.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text)
      .join('\n')
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
    const couponLegs = input.legs?.length ? input.legs.map(leg => ({
      eventName: leg.eventName ?? input.event_name,
      marketType: leg.marketType ?? input.market_type,
      selection: leg.selection ?? null,
      isLive: leg.isLive,
    })) : [{
      eventName: input.event_name,
      marketType: input.market_type,
      selection: input.selection ?? null,
      isLive: false,
    }]
    const candidateResearchBrief = analysis.research_brief
      ? toResearchBrief(analysis.research_brief)
      : null
    const alignedResearchBrief = candidateResearchBrief && !containsAnalystPricingClaim(candidateResearchBrief)
      ? alignAnalystResearchBriefToCoupon(candidateResearchBrief, couponLegs)
      : null
    const researchBrief = alignedResearchBrief ?? buildFallbackResearchBrief(input)

    // 8. Server owns pricing, but the quality gate can suppress it entirely.
    const qualityGate = evaluateAnalysisQuality({
      sport:              input.sport,
      eventName:          input.event_name,
      marketType:         input.market_type,
      selection:          input.selection ?? null,
      notes:              input.notes ?? null,
      // Search is not equivalent to complete coverage. Until each claim is
      // mapped to a citation, provider-declared coverage is never promoted.
      webSearchEnabled:    false,
      modelProbability:   analysis.model_probability,
      modelInputsPresent: false,
      sportModuleSupport: getAnalystSportSupport(input.sport),
      legs:               input.legs as AnalysisLegQualityInput[] | undefined,
    })
    const gatedPricing = buildAnalystPricingPayload({
      qualityGate,
      // This route has no calibrated probability model. The placeholder is
      // suppressed by the quality gate and never reaches persistence or UI.
      modelProbability: analysis.model_probability ?? 0,
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

    // 9. Keep sourced qualitative research distinct from pricing/model proof.
    const honestDisclaimer = webSearchActuallyUsed
      ? (input.output_language === 'uk'
          ? 'Поточні факти наведені лише там, де знайдено джерела. Імовірність, перевага та EV не розраховуються без перевірених модельних входів.'
          : 'Current facts are included only where sources were found. Probability, edge, and EV are not calculated without verified model inputs.')
      : (input.output_language === 'uk'
          ? 'Цей аналіз базується на купоні та наданому контексті; актуальні дані, які не вдалося перевірити, позначені як прогалини.'
          : 'This analysis uses the coupon and supplied context; current data that could not be verified is listed as a gap.')
    const safeDisclaimer = qualityGate.pricingAllowed
      ? analysis.disclaimer || honestDisclaimer
      : webSearchActuallyUsed
        ? honestDisclaimer
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
      coupon_event_time: input.coupon_event_time ?? null,
      client_timezone: input.client_timezone ?? null,
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
      research_brief:      researchBrief,
      research_sources:    researchSources,
      web_search_used:     webSearchActuallyUsed,
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
      p_web_search_used:     webSearchActuallyUsed,
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
        web_search_used:   webSearchActuallyUsed,
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
        research_brief:      researchBrief,
        research_sources:    researchSources,
        web_search_used:     webSearchActuallyUsed,
        // Input context echoed back (for UI display, PDF, share)
        sport:           input.sport,
        event_name:      input.event_name,
        market_type:     input.market_type,
        selection:       input.selection ?? null,
        line:            input.line ?? null,
        offered_odds:    input.offered_odds,
        bookmaker:       input.bookmaker ?? null,
        coupon_event_time: input.coupon_event_time ?? null,
        output_language: input.output_language,
      },
    })

  } catch (err: unknown) {
    const errorType = err instanceof Anthropic.RateLimitError
      ? 'anthropic_rate_limited'
      : err instanceof Anthropic.APIConnectionTimeoutError || (err instanceof Error && err.name === 'AbortError')
        ? 'anthropic_timeout'
        : err instanceof Anthropic.APIConnectionError
          ? 'anthropic_network'
          : 'internal'
    console.error('[analyst]', { errorType })
    const status = errorType === 'anthropic_rate_limited'
      ? 429
      : errorType === 'anthropic_timeout'
        ? 504
        : errorType === 'anthropic_network'
          ? 503
          : 500
    return NextResponse.json(
      { success: false, error: 'Analysis is temporarily unavailable. Please try again.' },
      { status },
    )
  }
}
