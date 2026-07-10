import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { trackServerEvent } from '@/lib/analytics/server'
import { EVENTS } from '@/lib/analytics/events'
import { extractJsonObject } from '@/lib/ai/extract-json'

const envInt = (key: string, def: number) => {
  const n = parseInt(process.env[key] ?? '', 10)
  return Number.isFinite(n) && n > 0 ? n : def
}

// ─── Rate limit store (in-memory, rolling 24h) ───────────────
const rateLimitStore = new Map<string, { day: number; dayTs: number }>()
const RATE_LIMIT_PER_DAY = envInt('RATE_LIMIT_COACH_PER_DAY', 20)

function checkRateLimit(userId: string): { allowed: boolean; retryAfter?: number } {
  const now = Date.now()
  const dayWindow = 86_400_000

  const entry = rateLimitStore.get(userId) ?? { day: 0, dayTs: now }
  if (now - entry.dayTs > dayWindow) { entry.day = 0; entry.dayTs = now }

  if (entry.day >= RATE_LIMIT_PER_DAY) {
    return { allowed: false, retryAfter: Math.ceil((entry.dayTs + dayWindow - now) / 1000) }
  }

  entry.day++
  rateLimitStore.set(userId, entry)
  return { allowed: true }
}

// ─── Zod schemas ─────────────────────────────────────────────
const requestSchema = z.object({
  period_days: z.union([z.literal(7), z.literal(30), z.literal(90), z.literal(0)]),
  focus_notes: z.string().max(500).optional(),
})

const recommendationSchema = z.object({
  priority: z.enum(['high', 'medium', 'low']),
  action:   z.string().min(5).max(300),
  detail:   z.string().min(10).max(1000),
})

const coachOutputSchema = z.object({
  summary:           z.string().min(20).max(2000),
  calibration_grade: z.enum(['excellent', 'good', 'fair', 'poor']).optional().nullable(),
  strengths:         z.array(z.string().min(5).max(500)).max(5),
  weaknesses:        z.array(z.string().min(5).max(500)).max(5),
  recommendations:   z.array(recommendationSchema).min(1).max(5),
  patterns:          z.record(z.string(), z.unknown()).optional().nullable(),
  disclaimer:        z.string().min(20),
})

function normalizeCoachRaw(raw: unknown): unknown {
  if (raw && typeof raw === 'object') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const o = raw as Record<string, any>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lc = (v: any) => typeof v === 'string' ? v.toLowerCase().trim() : v
    const grade = lc(o.calibration_grade)
    o.calibration_grade = ['excellent', 'good', 'fair', 'poor'].includes(grade) ? grade : null
    if (Array.isArray(o.recommendations)) {
      for (const r of o.recommendations) {
        if (r && typeof r === 'object') r.priority = lc(r.priority)
      }
    }
  }
  return raw
}

// ─── Data types ───────────────────────────────────────────────
type DbBet = {
  id: string
  bet_type: string
  stake: number
  total_odds: number | null
  status: string
  pnl: number | null
  source: string
  placed_at: string
  settled_at: string | null
  legs: Array<{
    sport: string | null
    market_type: string | null
    decisions: { confidence_score: number | null; edge_percent: number | null } | null
  }>
}

// ─── Aggregation helpers ──────────────────────────────────────
function isSettled(b: DbBet) {
  return b.status === 'won' || b.status === 'lost' || b.status === 'void'
}

function groupStats(bets: DbBet[]) {
  const won = bets.filter(b => b.status === 'won')
  const lost = bets.filter(b => b.status === 'lost')
  const roiEligible = [...won, ...lost]
  const netProfit = bets.filter(isSettled).reduce((s, b) => s + (b.pnl ?? 0), 0)
  const roiStake = roiEligible.reduce((s, b) => s + b.stake, 0)
  const wl = won.length + lost.length
  return {
    bets: bets.length,
    win_rate: wl > 0 ? parseFloat(((won.length / wl) * 100).toFixed(1)) : null as number | null,
    roi: roiStake > 0 ? parseFloat(((netProfit / roiStake) * 100).toFixed(1)) : null as number | null,
  }
}

function bucketWinRate(bets: DbBet[]): number | null {
  const won = bets.filter(b => b.status === 'won').length
  const wl  = bets.filter(b => b.status === 'won' || b.status === 'lost').length
  return wl > 0 ? parseFloat(((won / wl) * 100).toFixed(1)) : null
}

function buildAggregatedStats(
  bets: DbBet[],
  decisionsCount: number,
  scoutData: { status: string }[],
) {
  const settled = bets.filter(isSettled)
  const won = bets.filter(b => b.status === 'won')
  const lost = bets.filter(b => b.status === 'lost')
  const roiEligible = [...won, ...lost]

  const netProfit = settled.reduce((s, b) => s + (b.pnl ?? 0), 0)
  const roiStake  = roiEligible.reduce((s, b) => s + b.stake, 0)
  const roi       = roiStake > 0 ? parseFloat(((netProfit / roiStake) * 100).toFixed(1)) : null
  const wl        = won.length + lost.length
  const winRate   = wl > 0 ? parseFloat(((won.length / wl) * 100).toFixed(1)) : null
  const oddsPool  = roiEligible.filter(b => b.total_odds != null)
  const avgOdds   = oddsPool.length > 0
    ? parseFloat((oddsPool.reduce((s, b) => s + (b.total_odds ?? 0), 0) / oddsPool.length).toFixed(2))
    : null

  // By bet type
  const betTypeMap = new Map<string, DbBet[]>()
  for (const bet of bets) {
    const t = bet.bet_type || 'single'
    if (!betTypeMap.has(t)) betTypeMap.set(t, [])
    betTypeMap.get(t)!.push(bet)
  }
  const by_bet_type = Array.from(betTypeMap.entries())
    .map(([type, bs]) => ({ type, ...groupStats(bs) }))
    .sort((a, b) => b.bets - a.bets)

  // By sport (from first leg)
  const sportMap = new Map<string, DbBet[]>()
  for (const bet of bets) {
    const sport = bet.legs?.[0]?.sport ?? 'other'
    if (!sportMap.has(sport)) sportMap.set(sport, [])
    sportMap.get(sport)!.push(bet)
  }
  const by_sport = Array.from(sportMap.entries())
    .map(([sport, bs]) => ({ sport, ...groupStats(bs) }))
    .sort((a, b) => b.bets - a.bets)
    .slice(0, 5)

  // By market type (from first leg, top 5)
  const marketMap = new Map<string, DbBet[]>()
  for (const bet of bets) {
    const market = bet.legs?.[0]?.market_type ?? 'unknown'
    if (!marketMap.has(market)) marketMap.set(market, [])
    marketMap.get(market)!.push(bet)
  }
  const by_market_type = Array.from(marketMap.entries())
    .map(([market, bs]) => ({ market, ...groupStats(bs) }))
    .sort((a, b) => b.bets - a.bets)
    .slice(0, 5)

  // By source
  const sourceMap = new Map<string, DbBet[]>()
  for (const bet of bets) {
    const src = bet.source || 'manual'
    if (!sourceMap.has(src)) sourceMap.set(src, [])
    sourceMap.get(src)!.push(bet)
  }
  const by_source = Array.from(sourceMap.entries())
    .map(([source, bs]) => ({ source, ...groupStats(bs) }))
    .sort((a, b) => b.bets - a.bets)

  // Confidence calibration buckets (settled bets with decision data)
  const confBuckets: Record<string, DbBet[]> = { '80-100': [], '60-79': [], '40-59': [], '<40': [] }
  for (const bet of settled) {
    const conf = bet.legs?.[0]?.decisions?.confidence_score
    if (conf == null) continue
    if (conf >= 80)      confBuckets['80-100'].push(bet)
    else if (conf >= 60) confBuckets['60-79'].push(bet)
    else if (conf >= 40) confBuckets['40-59'].push(bet)
    else                 confBuckets['<40'].push(bet)
  }
  const betsWithConf = Object.values(confBuckets).reduce((s, bs) => s + bs.length, 0)
  const confidence_buckets = Object.entries(confBuckets).map(([bucket, bs]) => ({
    bucket,
    bets: bs.length,
    win_rate: bucketWinRate(bs),
  }))

  // Edge accuracy buckets — FP-001 gate: intentionally empty. Every non-null
  // decisions.edge_percent in the database predates the analysis quality gate
  // (which now nulls pricing on all blocked runs), i.e. it is a fabricated
  // FP-001-era number with no data basis. Feeding those into "edge accuracy"
  // coaching would launder false precision into calibration advice. Re-enable
  // only when gate-passed priced decisions exist.
  const edge_buckets = ['>10%', '5-10%', '0-5%', 'negative'].map(bucket => ({
    bucket,
    bets: 0,
    win_rate: null as number | null,
  }))

  // Stake buckets
  const stakeBuckets: Record<string, DbBet[]> = { 'large (>50)': [], 'medium (10-50)': [], 'small (<10)': [] }
  for (const bet of bets) {
    if (bet.stake > 50)      stakeBuckets['large (>50)'].push(bet)
    else if (bet.stake >= 10) stakeBuckets['medium (10-50)'].push(bet)
    else                      stakeBuckets['small (<10)'].push(bet)
  }
  const stake_buckets = Object.entries(stakeBuckets).map(([bucket, bs]) => {
    const np = bs.filter(isSettled).reduce((s, b) => s + (b.pnl ?? 0), 0)
    const rs = bs.filter(b => b.status === 'won' || b.status === 'lost').reduce((s, b) => s + b.stake, 0)
    return { bucket, bets: bs.length, roi: rs > 0 ? parseFloat(((np / rs) * 100).toFixed(1)) : null as number | null }
  })

  // Current streak (won/lost only, ignore void)
  const resolved = settled
    .filter(b => b.status === 'won' || b.status === 'lost')
    .sort((a, b) => new Date(a.placed_at).getTime() - new Date(b.placed_at).getTime())
  let streakCount = 0
  let streakType: 'win' | 'loss' | 'none' = 'none'
  if (resolved.length > 0) {
    const lastStatus = resolved[resolved.length - 1].status
    streakType = lastStatus === 'won' ? 'win' : 'loss'
    for (let i = resolved.length - 1; i >= 0; i--) {
      if (resolved[i].status === lastStatus) streakCount++
      else break
    }
  }

  // Recent form
  const recentSettled = [...settled].sort((a, b) => {
    const ta = a.settled_at ? new Date(a.settled_at).getTime() : new Date(a.placed_at).getTime()
    const tb = b.settled_at ? new Date(b.settled_at).getTime() : new Date(b.placed_at).getTime()
    return tb - ta
  })
  const last5 = recentSettled.slice(0, 5).map(b => b.status as 'won' | 'lost' | 'void').reverse()
  const last10 = recentSettled.slice(0, 10)
  const last10NP = last10.filter(isSettled).reduce((s, b) => s + (b.pnl ?? 0), 0)
  const last10Stake = last10.filter(b => b.status === 'won' || b.status === 'lost').reduce((s, b) => s + b.stake, 0)
  const last10ROI = last10Stake > 0 ? parseFloat(((last10NP / last10Stake) * 100).toFixed(1)) : null

  // Scout funnel
  const scout_funnel = {
    scouted:    scoutData.length,
    watchlisted: scoutData.filter(s => s.status === 'watchlisted').length,
    converted:  scoutData.filter(s => s.status === 'converted_to_decision').length,
    dismissed:  scoutData.filter(s => s.status === 'dismissed').length,
  }

  return {
    period: {
      bets_count:      bets.length,
      decisions_count: decisionsCount,
      settled_count:   settled.length,
    },
    overall: { roi, win_rate: winRate, net_profit: netProfit, avg_odds: avgOdds },
    by_bet_type,
    by_sport,
    by_market_type,
    by_source,
    confidence_buckets,
    edge_buckets,
    stake_buckets,
    streak: { current_streak: streakCount, streak_type: streakType },
    scout_funnel,
    recent_form: { last_5: last5, last_10_roi: last10ROI },
    has_ai_analyst_bets: bets.some(b => b.source === 'ai_analyst'),
    bets_with_confidence: betsWithConf,
    insufficient_data: settled.length < 5,
  }
}

// ─── Prompt ────────────────────────────────────────────────────
function buildCoachSystemPrompt(): string {
  return `You are the Coach for BetTracker AI — a retrospective performance analysis tool for serious bettors.

ROLE: Analyse the bettor's performance statistics and deliver specific, honest advice for improving decision quality. You are NOT a tipster — never predict future outcomes or recommend specific bets.

LANGUAGE: If the user provided focus notes, respond in the same language as those notes. Otherwise use English.

ABSOLUTE GUARDRAILS — any violation means the output is rejected:
- Retrospective only. Analyse what happened. Never predict future outcomes.
- Never suggest increasing stake sizes, going all-in, or betting more.
- Never suggest chasing losses or trying to recover money.
- Never use: "guaranteed", "sure bet", "lock", "must bet", "all-in", "chase", "recover", "free money"
- If bets_analysed < 20: explicitly caveat every pattern claim as preliminary due to small sample.
- calibration_grade: only assign if >= 10 bets had confidence scores recorded. Otherwise MUST be null.
- Recommendations must be specific and actionable. "Be more selective" is not acceptable.
- disclaimer must honestly state that past performance does not predict future results.

OUTPUT FORMAT — return ONLY a valid JSON object, no markdown, no text outside the JSON:
{
  "summary": "<2-4 sentence overall assessment of the period>",
  "calibration_grade": "<'excellent' | 'good' | 'fair' | 'poor' | null>",
  "strengths": ["<specific strength with data reference>"],
  "weaknesses": ["<specific weakness with data reference>"],
  "recommendations": [
    {
      "priority": "<'high' | 'medium' | 'low'>",
      "action": "<short, specific, actionable instruction>",
      "detail": "<1-3 sentences explaining the pattern and why this action helps>"
    }
  ],
  "patterns": { "<key>": "<value>" },
  "disclaimer": "<honest statement about sample size, variance, and past performance>"
}

strengths: 0-5 items. Return [] if too little data for meaningful claims.
weaknesses: 0-5 items. Return [] if too little data.
recommendations: 1-5 items, ordered high priority first.
patterns: flexible — use keys like best_sport, worst_bet_type, calibration_note as applicable.

CALIBRATION GRADING (only if >= 10 bets with confidence scores):
- excellent: high-confidence (60+) bets win noticeably more than low-confidence (<40), consistently
- good: high-confidence generally outperforms with minor inconsistencies
- fair: some correlation but significant inconsistencies
- poor: no meaningful correlation or inverse correlation

INTERPRETATION GUIDE:
- ROI = net profit / stake (void excluded). Positive = profitable.
- Win rate alone is insufficient — must consider average odds.
- Loss streaks of 3-5 in small samples are almost always variance, not signal.
- Scout conversion = converted / scouted; low conversion may indicate over-scouting or analysis paralysis.`
}

const PERIOD_LABEL: Record<number, string> = {
  7: 'Last 7 days',
  30: 'Last 30 days',
  90: 'Last 90 days',
  0: 'All time',
}

function buildUserMessage(
  stats: ReturnType<typeof buildAggregatedStats>,
  focusNotes: string | undefined,
  periodLabel: string,
): string {
  const { period, overall, by_bet_type, by_sport, by_market_type, by_source,
          confidence_buckets, edge_buckets, stake_buckets, streak, scout_funnel,
          recent_form, bets_with_confidence } = stats

  const fmtPct = (v: number | null) => v != null ? `${v >= 0 ? '+' : ''}${v.toFixed(1)}%` : 'N/A'
  const fmtNum = (v: number | null, dp = 2) => v != null ? v.toFixed(dp) : 'N/A'

  const betTypeLines = by_bet_type.length > 0
    ? by_bet_type.map(b => `  ${b.type}: ${b.bets} bets | WR: ${fmtPct(b.win_rate)} | ROI: ${fmtPct(b.roi)}`).join('\n')
    : '  No data'

  const sportLines = by_sport.length > 0
    ? by_sport.map(s => `  ${s.sport}: ${s.bets} bets | WR: ${fmtPct(s.win_rate)} | ROI: ${fmtPct(s.roi)}`).join('\n')
    : '  No data'

  const marketLines = by_market_type.length > 0
    ? by_market_type.map(m => `  ${m.market}: ${m.bets} bets | WR: ${fmtPct(m.win_rate)} | ROI: ${fmtPct(m.roi)}`).join('\n')
    : '  No data'

  const sourceLines = by_source.length > 0
    ? by_source.map(s => `  ${s.source}: ${s.bets} bets | WR: ${fmtPct(s.win_rate)} | ROI: ${fmtPct(s.roi)}`).join('\n')
    : '  No data'

  const confNote = bets_with_confidence < 10
    ? ` (only ${bets_with_confidence} bets with confidence scores — calibration_grade MUST be null)`
    : ` (${bets_with_confidence} bets with confidence scores)`
  const confLines = confidence_buckets.filter(b => b.bets > 0).length > 0
    ? confidence_buckets.filter(b => b.bets > 0).map(b => `  ${b.bucket}: ${b.bets} bets | WR: ${fmtPct(b.win_rate)}`).join('\n')
    : '  No AI Analyst bets with confidence scores in this period'

  const edgeLines = edge_buckets.filter(b => b.bets > 0).length > 0
    ? edge_buckets.filter(b => b.bets > 0).map(b => `  ${b.bucket}: ${b.bets} bets | WR: ${fmtPct(b.win_rate)}`).join('\n')
    : '  No AI Analyst bets with edge data in this period'

  const stakeLines = stake_buckets.filter(b => b.bets > 0).length > 0
    ? stake_buckets.filter(b => b.bets > 0).map(b => `  ${b.bucket}: ${b.bets} bets | ROI: ${fmtPct(b.roi)}`).join('\n')
    : '  No data'

  const streakText = streak.streak_type === 'none'
    ? 'No resolved bets'
    : `${streak.current_streak}-${streak.streak_type} streak`

  const smallSampleWarning = period.settled_count < 20
    ? `\n⚠️ SMALL SAMPLE WARNING: Only ${period.settled_count} settled bets. All pattern claims are highly preliminary. Caveat this explicitly in your summary and recommendations.`
    : ''

  return `COACHING REQUEST
Period: ${periodLabel} | Settled: ${period.settled_count} bets | Total: ${period.bets_count} bets | Decisions: ${period.decisions_count}${focusNotes ? `\nUser focus: "${focusNotes}"` : ''}

=== OVERALL PERFORMANCE ===
Net P&L: ${fmtNum(overall.net_profit)} | ROI: ${fmtPct(overall.roi)} | Win rate: ${fmtPct(overall.win_rate)} | Avg odds: ${fmtNum(overall.avg_odds)}

=== BY BET TYPE ===
${betTypeLines}

=== BY SPORT (top 5) ===
${sportLines}

=== BY MARKET TYPE (top 5) ===
${marketLines}

=== BY SOURCE ===
${sourceLines}

=== CONFIDENCE CALIBRATION${confNote} ===
${confLines}

=== EDGE ACCURACY (AI Analyst bets only) ===
${edgeLines}

=== STAKE SIZE EFFECT ===
${stakeLines}

=== RECENT FORM ===
Last 5 results (oldest→newest): ${recent_form.last_5.length > 0 ? recent_form.last_5.join(', ') : 'N/A'}
Last 10 ROI: ${fmtPct(recent_form.last_10_roi)}
Current streak: ${streakText}

=== SCOUT USAGE ===
Scouted: ${scout_funnel.scouted} | Watchlisted: ${scout_funnel.watchlisted} | Converted to decision: ${scout_funnel.converted} | Dismissed: ${scout_funnel.dismissed}
${smallSampleWarning}`
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

    // 2. Rate limit (first after auth)
    const rl = checkRateLimit(user.id)
    if (!rl.allowed) {
      return NextResponse.json(
        { success: false, error: 'Rate limit exceeded. Coach can run 2 times per 24 hours.' },
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

    // 4. Compute period dates
    const now = new Date()
    const periodStart = input.period_days > 0
      ? new Date(now.getTime() - input.period_days * 86_400_000)
      : null

    // 5. Fetch data in parallel
    let betsQuery = supabase
      .from('bets')
      .select('id, bet_type, stake, total_odds, status, pnl, source, placed_at, settled_at, legs:bet_legs(sport, market_type, decisions(confidence_score, edge_percent))')
      .eq('user_id', user.id)
      .order('placed_at', { ascending: false })

    let decisionsQuery = supabase
      .from('decisions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)

    let scoutQuery = supabase
      .from('market_opportunities')
      .select('status')
      .eq('user_id', user.id)

    if (periodStart) {
      betsQuery     = betsQuery.gte('placed_at', periodStart.toISOString())
      decisionsQuery = decisionsQuery.gte('created_at', periodStart.toISOString())
      scoutQuery    = scoutQuery.gte('created_at', periodStart.toISOString())
    }

    const [betsRes, decisionsRes, scoutRes] = await Promise.all([
      betsQuery,
      decisionsQuery,
      scoutQuery,
    ])

    const bets          = (betsRes.data ?? []) as unknown as DbBet[]
    const decisionsCount = decisionsRes.count ?? 0
    const scoutData     = (scoutRes.data ?? []) as { status: string }[]

    // 6. Aggregate stats server-side
    const stats = buildAggregatedStats(bets, decisionsCount, scoutData)

    // 7. Insufficient data gate (no Claude call)
    if (stats.insufficient_data) {
      return NextResponse.json(
        { success: false, error: 'Insufficient data: at least 5 settled bets are required. Settle more bets and try again.' },
        { status: 422 }
      )
    }

    await trackServerEvent(user.id, EVENTS.COACH_STARTED, {
      period_days:     input.period_days,
      has_focus_notes: !!input.focus_notes,
      bets_analysed:   stats.period.settled_count,
    })

    // 8. Build prompt
    const periodLabel  = PERIOD_LABEL[input.period_days] ?? `Last ${input.period_days} days`
    const systemPrompt = buildCoachSystemPrompt()
    const userMessage  = buildUserMessage(stats, input.focus_notes, periodLabel)

    // 9. Claude call
    const model     = process.env.ANTHROPIC_MODEL_COACH ?? process.env.ANTHROPIC_MODEL_ANALYST ?? 'claude-sonnet-4-6'
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    const message = await anthropic.messages.create({
      model,
      max_tokens: 2000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    })

    // 10. Extract text block
    const rawText = message.content
      .filter(b => b.type === 'text')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map(b => (b as any).text as string)
      .at(-1) ?? ''

    // 11. Parse + Zod validate
    let coachRaw: unknown
    try {
      coachRaw = JSON.parse(extractJsonObject(rawText))
    } catch {
      await trackServerEvent(user.id, EVENTS.COACH_FAILED, { period_days: input.period_days, error_type: 'ai_parse' })
      return NextResponse.json(
        { success: false, error: 'Coach returned invalid JSON. Please try again.' },
        { status: 502 }
      )
    }

    const coachRaw2 = normalizeCoachRaw(coachRaw)
    const validated = coachOutputSchema.safeParse(coachRaw2)
    if (!validated.success) {
      console.error('[coach] schema_mismatch', {
        issueCount: validated.error.issues.length,
        issues: validated.error.issues.map(i => ({ path: i.path, code: i.code, message: i.message })),
        outputChars: rawText.length,
      })
      await trackServerEvent(user.id, EVENTS.COACH_FAILED, { period_days: input.period_days, error_type: 'ai_schema' })
      return NextResponse.json(
        { success: false, error: 'Coach output did not match expected schema. Please try again.' },
        { status: 502 }
      )
    }

    const output = validated.data

    // 12. Persist session
    const row = {
      user_id:            user.id,
      period_days:        input.period_days,
      period_start:       periodStart ? periodStart.toISOString().split('T')[0] : null,
      period_end:         now.toISOString().split('T')[0],
      bets_analysed:      stats.period.settled_count,
      decisions_analysed: stats.period.decisions_count,
      summary:            output.summary,
      calibration_grade:  output.calibration_grade ?? null,
      strengths:          output.strengths,
      weaknesses:         output.weaknesses,
      recommendations:    output.recommendations,
      patterns:           output.patterns ?? null,
      metrics_snapshot:   stats as unknown as Record<string, unknown>,
      focus_notes:        input.focus_notes ?? null,
      model_name:         model,
      disclaimer:         output.disclaimer,
    }

    // Decision #049: coaching_sessions is SELECT-only for authenticated
    // after migration 020 — persistence goes through the server-only
    // persist_coaching_session RPC (service_role EXECUTE only) with the
    // session-derived user id.
    const adminClient = createAdminClient()
    const { data: inserted, error: insertErr } = await adminClient.rpc('persist_coaching_session', {
      p_user_id:            user.id,
      p_period_days:        row.period_days,
      p_period_start:       row.period_start,
      p_period_end:         row.period_end,
      p_bets_analysed:      row.bets_analysed,
      p_decisions_analysed: row.decisions_analysed,
      p_summary:            row.summary,
      p_calibration_grade:  row.calibration_grade,
      p_strengths:          row.strengths,
      p_weaknesses:         row.weaknesses,
      p_recommendations:    row.recommendations,
      p_patterns:           row.patterns,
      p_metrics_snapshot:   row.metrics_snapshot,
      p_focus_notes:        row.focus_notes,
      p_model_name:         row.model_name,
      p_disclaimer:         row.disclaimer,
    })

    if (insertErr) {
      console.error('[coach] persist error:', insertErr.message)
      await trackServerEvent(user.id, EVENTS.COACH_FAILED, { period_days: input.period_days, error_type: 'persist' })
      return NextResponse.json(
        { success: false, error: 'Coach succeeded but failed to persist' },
        { status: 500 }
      )
    }

    await trackServerEvent(user.id, EVENTS.COACH_COMPLETED, {
      period_days:          input.period_days,
      calibration_grade:    output.calibration_grade ?? null,
      recommendation_count: output.recommendations.length,
      strengths_count:      output.strengths.length,
      weaknesses_count:     output.weaknesses.length,
    })

    return NextResponse.json({ success: true, data: inserted })

  } catch (err: unknown) {
    console.error('[coach]', err)
    const msg = err instanceof Error ? err.message : 'Internal error'
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}
