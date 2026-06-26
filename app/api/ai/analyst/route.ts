import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

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
  event_name:      z.string().min(1).max(200),
  market_type:     z.string().min(1).max(100),
  selection:       z.string().max(100).optional(),
  line:            z.number().optional(),
  offered_odds:    z.number().min(1.01).max(1000),
  bookmaker:       z.string().max(50).optional(),
  notes:           z.string().max(500).optional(),
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

    // 4. Load profile (web search setting)
    const { data: profile } = await supabase
      .from('profiles')
      .select('web_search_enabled')
      .eq('id', user.id)
      .single()
    const webSearchEnabled = profile?.web_search_enabled ?? false

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
      return NextResponse.json(
        { success: false, error: 'AI returned invalid JSON. Please try again.' },
        { status: 502 }
      )
    }

    const validated = analysisSchema.safeParse(analysisRaw)
    if (!validated.success) {
      return NextResponse.json(
        { success: false, error: 'AI output did not match expected schema. Please try again.' },
        { status: 502 }
      )
    }

    const analysis = validated.data

    return NextResponse.json({
      success: true,
      data: {
        ...analysis,
        // Pass back input context for RPC call
        _meta: {
          sport:           input.sport,
          event_name:      input.event_name,
          market_type:     input.market_type,
          selection:       input.selection ?? null,
          line:            input.line ?? null,
          offered_odds:    input.offered_odds,
          bookmaker:       input.bookmaker ?? null,
          output_language: input.output_language,
          model_name:      model,
          web_search_used: webSearchEnabled,
          input_chars:     inputChars,
          output_chars:    outputChars,
        },
      },
    })

  } catch (err: unknown) {
    console.error('[analyst]', err)
    const msg = err instanceof Error ? err.message : 'Internal error'
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}
