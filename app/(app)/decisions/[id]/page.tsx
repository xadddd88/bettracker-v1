import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import DecisionActions from './DecisionActions'
import { PageView } from '@/lib/analytics/PageView'
import { EVENTS } from '@/lib/analytics/events'
import {
  buildAnalystDecisionSurfaceView,
  buildAnalystTrustView,
  shouldShowPricingStats,
  type AnalysisQualityGateResult,
  type AnalystTrustView,
} from '@/lib/ai/analysis-quality-gate'
import { currencySymbol } from '@/lib/money'

interface Factor { name: string; score: number; detail: string }

interface AnalysisRunRow {
  output_json: {
    quality_gate?: AnalysisQualityGateResult | null
    trust_view?: AnalystTrustView | null
    edge_bucket?: string | null
  } | null
}

interface DecisionRow {
  id: string
  sport: string | null
  event_name: string
  market_type: string | null
  selection: string | null
  line: number | null
  offered_odds: number | null
  bookmaker: string | null
  final_action: string
  source: string
  recommendation: string | null
  risk_level: string | null
  model_probability: number | null
  implied_probability: number | null
  edge_percent: number | null
  confidence_score: number | null
  reasoning: string | null
  factors: Factor[] | null
  output_language: string | null
  created_at: string
  bet_legs: { bet_id: string; bets: { id: string; stake: number; status: string; total_odds: number | null } | null }[]
  ai_analysis_runs: AnalysisRunRow[] | null
}

const REC_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  bet:      { label: 'BET',      color: 'text-green-400',  bg: 'bg-green-950/40 border-green-800' },
  watch:    { label: 'WATCH',    color: 'text-yellow-400', bg: 'bg-yellow-950/40 border-yellow-800' },
  skip:     { label: 'SKIP',     color: 'text-gray-400',   bg: 'bg-gray-800/40 border-gray-700' },
  no_value: { label: 'NO VALUE', color: 'text-red-400',    bg: 'bg-red-950/40 border-red-800' },
}

const RISK_CONFIG: Record<string, { label: string; color: string }> = {
  low:    { label: 'Low Risk',    color: 'text-green-400' },
  medium: { label: 'Medium Risk', color: 'text-yellow-400' },
  high:   { label: 'High Risk',   color: 'text-red-400' },
}

const ACTION_CONFIG: Record<string, { label: string; color: string }> = {
  pending:     { label: 'Pending',     color: 'text-gray-400' },
  placed:      { label: 'Placed',      color: 'text-green-400' },
  skipped:     { label: 'Skipped',     color: 'text-gray-500' },
  watchlisted: { label: 'Watchlisted', color: 'text-yellow-400' },
  ignored:     { label: 'Ignored',     color: 'text-gray-600' },
}

function getDecisionTrustView(d: DecisionRow, qualityGate: AnalysisQualityGateResult | null): AnalystTrustView | null {
  const stored = d.ai_analysis_runs?.[0]?.output_json?.trust_view ?? null
  if (stored) return stored
  if (!qualityGate) return null
  return buildAnalystTrustView({
    qualityGate,
    locale:       d.output_language,
    eventName:    d.event_name,
    marketType:   d.market_type ?? '',
    selection:    d.selection,
    rawReasoning: d.reasoning,
    rawFactors:   d.factors,
  })
}

function localizedRiskLabel(risk: string | null, fallback: string | null, trustView: AnalystTrustView | null): string | null {
  if (!fallback) return null
  if (trustView?.locale !== 'uk') return fallback
  if (risk === 'high') return 'Високий ризик'
  if (risk === 'medium') return 'Середній ризик'
  if (risk === 'low') return 'Низький ризик'
  return fallback
}

function ScoreBar({ score }: { score: number }) {
  const color = score > 0 ? 'bg-green-500' : score < 0 ? 'bg-red-500' : 'bg-gray-500'
  return (
    <div className="flex items-center gap-2 mt-0.5">
      <div className="flex-1 bg-gray-800 rounded-full h-1.5 relative">
        <div className="absolute left-1/2 top-0 bottom-0 w-px bg-gray-600" />
        <div
          className={`h-1.5 rounded-full ${color}`}
          style={{
            width: `${Math.abs(score) / 3 * 50}%`,
            marginLeft: score >= 0 ? '50%' : `${50 - Math.abs(score) / 3 * 50}%`,
          }}
        />
      </div>
      <span className={`text-xs font-mono w-6 text-right ${score > 0 ? 'text-green-400' : score < 0 ? 'text-red-400' : 'text-gray-500'}`}>
        {score > 0 ? `+${score}` : score}
      </span>
    </div>
  )
}

export default async function DecisionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) notFound()

  const [{ data: decision }, { data: bankroll }] = await Promise.all([
    supabase
      .from('decisions')
      .select(`
        id, sport, event_name, market_type, selection, line,
        offered_odds, bookmaker, final_action, source,
        recommendation, risk_level, model_probability, implied_probability,
        edge_percent, confidence_score, reasoning, factors,
        output_language, created_at,
        bet_legs(bet_id, bets(id, stake, status, total_odds)),
        ai_analysis_runs(output_json)
      `)
      .eq('id', id)
      .eq('user_id', user.id)
      .single(),
    supabase
      .from('bankrolls')
      .select('currency')
      .eq('user_id', user.id)
      .eq('is_default', true)
      .maybeSingle(),
  ])

  if (!decision) notFound()

  const stakeSymbol = currencySymbol(bankroll?.currency)

  const d = decision as unknown as DecisionRow
  const rec    = d.recommendation ? REC_CONFIG[d.recommendation]   : null
  const risk   = d.risk_level     ? RISK_CONFIG[d.risk_level]      : null
  const action = ACTION_CONFIG[d.final_action] ?? ACTION_CONFIG.pending
  const linkedBet = d.bet_legs?.[0]?.bets ?? null
  const analysisOutput = d.ai_analysis_runs?.[0]?.output_json ?? null
  const qualityGate = analysisOutput?.quality_gate ?? null
  const storedTrustView = getDecisionTrustView(d, qualityGate)
  const showPricing = shouldShowPricingStats({
    qualityGate,
    modelProbability:   d.model_probability,
    impliedProbability: d.implied_probability,
    edgePercent:        d.edge_percent,
  })
  const surface = buildAnalystDecisionSurfaceView({
    qualityGate,
    trustView:          storedTrustView,
    locale:             d.output_language,
    sport:              d.sport,
    eventName:          d.event_name,
    marketType:         d.market_type ?? '',
    selection:          d.selection,
    offeredOdds:        d.offered_odds,
    bookmaker:          d.bookmaker,
    recommendation:     d.recommendation,
    finalAction:        d.final_action,
    confidenceScore:    d.confidence_score,
    modelProbability:   d.model_probability,
    impliedProbability: d.implied_probability,
    edgePercent:        d.edge_percent,
    edgeBucket:         analysisOutput?.edge_bucket,
    rawReasoning:       d.reasoning,
    rawFactors:         d.factors,
  })
  const trustView = surface.trustView
  const displayFactors: Factor[] = trustView && !showPricing ? trustView.displayFactors : d.factors ?? []

  const date = new Date(d.created_at).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  })

  return (
    <div className="max-w-2xl flex flex-col gap-5">
      <PageView event={EVENTS.DECISION_DETAIL_VIEWED} props={{ sport: d.sport, final_action: d.final_action }} />
      {/* Back */}
      <Link href="/decisions" className="text-sm text-gray-500 hover:text-gray-300 transition-colors">
        ← Back to Decisions
      </Link>

      {/* Header */}
      <div className="flex items-start gap-3">
        <span className="text-[11px] font-bold text-slate-500 bg-night-800 border border-night-700 px-1.5 py-0.5 rounded self-start mt-1">{surface.sportLabel}</span>
        <div>
          <h1 className="text-xl font-bold text-white leading-tight">{d.event_name}</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {d.market_type}{d.selection ? ` · ${d.selection}` : ''}{d.line != null ? ` · ${d.line}` : ''}
            {d.offered_odds ? ` · @${d.offered_odds}` : ''}
          </p>
          <div className="flex items-center gap-3 mt-1">
            <span className={`text-xs font-medium ${action.color}`}>{surface.isTrustBlocked ? surface.actionLabel : action.label}</span>
            {(rec || surface.isTrustBlocked) && (
              <span className={`text-xs font-semibold ${showPricing ? rec?.color ?? 'text-slate-400' : 'text-amber-300'}`}>
                {showPricing ? `AI: ${rec?.label ?? surface.detailRecommendationLabel}` : surface.detailRecommendationLabel}
              </span>
            )}
            {risk && <span className={`text-xs ${risk.color}`}>{localizedRiskLabel(d.risk_level, risk.label, trustView)}</span>}
            <span className="text-xs text-gray-600">{date}</span>
          </div>
        </div>
      </div>

      {/* AI Analysis card */}
      {(showPricing || surface.isTrustBlocked || d.reasoning) && (
        <div className={`card border ${rec?.bg ?? 'border-gray-700'} flex flex-col gap-4`}>
          <div className="text-xs text-gray-500 uppercase tracking-wider font-semibold">{trustView?.locale === 'uk' ? 'AI-аналіз' : 'AI Analysis'}</div>

          {/* Probabilities */}
          {showPricing && (
            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <div className="text-xs text-gray-500 mb-0.5">Model prob.</div>
                <div className="text-2xl font-bold text-white">{d.model_probability?.toFixed(1)}%</div>
              </div>
              <div>
                <div className="text-xs text-gray-500 mb-0.5">Implied</div>
                <div className="text-2xl font-bold text-gray-300">
                  {d.implied_probability != null ? `${d.implied_probability.toFixed(1)}%` : '—'}
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-500 mb-0.5">Edge</div>
                <div className={`text-2xl font-bold ${(d.edge_percent ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {d.edge_percent != null
                    ? `${d.edge_percent >= 0 ? '+' : ''}${d.edge_percent.toFixed(1)}%`
                    : '—'}
                </div>
              </div>
            </div>
          )}

          {!showPricing && surface.isTrustBlocked && trustView && (
            <div className="rounded-lg border border-amber-900/70 bg-amber-950/25 px-3 py-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-amber-300">{trustView.riskWarningLabel}</div>
                  <div className="text-lg font-bold text-amber-100 mt-0.5">{trustView.label}</div>
                  <div className="text-sm text-amber-100/80 mt-0.5">{trustView.supportLabel}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-amber-400">{trustView.dataCoverageLabel}</div>
                  <div className="text-lg font-bold text-amber-100">{trustView.dataCoverageScore}/100</div>
                </div>
              </div>
              {trustView.safeExplanation && (
                <p className="text-xs text-amber-100/90 mt-3">{trustView.safeExplanation}</p>
              )}
              {trustView.legs.length > 0 ? (
                <div className="mt-3">
                  <div className="text-xs font-medium text-amber-300 mb-1">{trustView.missingDataChecklistLabel}</div>
                  <div className="flex flex-col gap-2">
                    {trustView.legs.map(leg => (
                      <div key={`${leg.legLabel}-${leg.sport}-${leg.legNumber}`} className="text-xs text-amber-100/90 rounded border border-amber-900/40 px-2 py-2">
                        <div className="font-medium">{leg.legLabel} / {leg.sportLabel}</div>
                        <div className="text-amber-100/75 mt-0.5">{leg.eventName}</div>
                        <div className="text-amber-100/75">{leg.marketType}{leg.selection ? ` / ${leg.selection}` : ''}</div>
                        {leg.periodOrPhase && (
                          <div className="text-amber-100/75">{trustView.locale === 'uk' ? 'Період / фаза' : 'Period / phase'}: {leg.periodOrPhase}</div>
                        )}
                        {leg.statusSourceLabel && (
                          <div className="text-amber-100/75">{trustView.locale === 'uk' ? 'Джерело статусу' : 'Status source'}: {leg.statusSourceLabel}</div>
                        )}
                        {leg.odds != null && (
                          <div className="text-amber-100/75">{trustView.locale === 'uk' ? 'Коефіцієнт' : 'Odds'}: {leg.odds}</div>
                        )}
                        <div className="mt-1 text-amber-200/80">{leg.fixtureStatusLabel} · {leg.supportLabel} · {leg.actionabilityLabel}</div>
                        <ul className="list-disc pl-4 mt-0.5 text-amber-200/80">
                          {leg.missingData.map(item => <li key={item}>{item}</li>)}
                        </ul>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          )}

          {/* Confidence */}
          {d.confidence_score != null && (
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-gray-500">{trustView?.confidenceLabel ?? 'Confidence'}</span>
                <span className="text-gray-300">{d.confidence_score}/100</span>
              </div>
              <div className="bg-gray-800 rounded-full h-1.5">
                <div
                  className="h-1.5 rounded-full bg-indigo-500"
                  style={{ width: `${d.confidence_score}%` }}
                />
              </div>
            </div>
          )}

          {/* Reasoning */}
          {d.reasoning && (
            <p className="text-sm text-gray-300 leading-relaxed">{trustView && !showPricing ? trustView.displayReasoning : d.reasoning}</p>
          )}
        </div>
      )}

      {/* Factors */}
      {displayFactors.length > 0 && (
        <div className="card flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-gray-300 mb-1">{trustView?.factorAnalysisLabel ?? 'Factor Analysis'}</h3>
          {displayFactors.map((f: Factor, i: number) => (
            <div key={i} className="py-1.5 border-b border-gray-800 last:border-0">
              <span className="text-sm text-gray-200">{f.name}</span>
              <ScoreBar score={f.score} />
              <p className="text-xs text-gray-500 mt-1">{f.detail}</p>
            </div>
          ))}
        </div>
      )}

      {/* Linked bet */}
      {linkedBet && (
        <div className="card border border-gray-700">
          <div className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-2">Linked Bet</div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-300">Stake: <span className="text-white font-medium">{stakeSymbol}{linkedBet.stake}</span></span>
            <span className="text-gray-300">Odds: <span className="text-white font-medium">{linkedBet.total_odds ?? d.offered_odds}</span></span>
            <span className={`font-medium capitalize ${linkedBet.status === 'won' ? 'text-green-400' : linkedBet.status === 'lost' ? 'text-red-400' : 'text-yellow-400'}`}>
              {linkedBet.status}
            </span>
          </div>
        </div>
      )}

      {/* Actions — only if still pending */}
      {d.final_action === 'pending' && (
        <DecisionActions
          decisionId={d.id}
          offeredOdds={d.offered_odds}
          canPlaceBet={showPricing && (trustView?.showPlaceBet ?? true)}
          canWatch={trustView?.showWatch !== false}
          labels={trustView ? {
            placeBet:     trustView.placeBetLabel,
            watch:        trustView.watchLabel,
            skip:         trustView.skipLabel,
            checkRisk:    trustView.locale === 'uk' ? 'Перевірити ризик' : 'Check Risk',
            cancel:       trustView.locale === 'uk' ? 'Скасувати' : 'Cancel',
            stakePrompt:  trustView.locale === 'uk' ? 'Введіть суму ставки' : 'Enter stake amount',
            invalidStake: trustView.locale === 'uk' ? 'Введіть коректну суму ставки' : 'Enter a valid stake amount',
            helper:       trustView.locale === 'uk'
              ? 'Пропуск або спостереження буде збережено в історії рішень.'
              : 'Skipping or watching is a valid decision - it will be saved to your history.',
          } : undefined}
        />
      )}

      {d.final_action !== 'pending' && (
        <div className="text-center text-sm text-gray-600">
          {surface.isTrustBlocked && surface.locale === 'uk' ? 'Це рішення позначено як ' : 'This decision was marked as '}
          <span className={`font-medium ${action.color}`}>
            {surface.isTrustBlocked ? surface.actionLabel.toLowerCase() : action.label.toLowerCase()}
          </span>.
        </div>
      )}
    </div>
  )
}
