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
import { formatMoney } from '@/lib/money'
import { resolveBetStatus, type BetStatusKey } from '@/lib/bets/bet-status'
import {
  bindAnalystSourcedClaims,
  parseStoredAnalystResearchBrief,
  parseStoredAnalystResearchSources,
} from '@/lib/ai/analyst-research'
import {
  BroadcastDataValue,
  BroadcastPanel,
  BroadcastStatus,
} from '@/components/ui/BroadcastNoir'
import type { BroadcastNoirStatus } from '@/lib/ui/broadcast-noir'

interface Factor { name: string; score: number; detail: string }

interface AnalysisRunRow {
  output_json: {
    quality_gate?: AnalysisQualityGateResult | null
    trust_view?: AnalystTrustView | null
    edge_bucket?: string | null
    research_brief?: unknown
    research_sources?: unknown
    web_search_used?: boolean
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

const REC_CONFIG: Record<string, { label: string }> = {
  bet:      { label: 'BET' },
  watch:    { label: 'WATCH' },
  skip:     { label: 'SKIP' },
  no_value: { label: 'NO VALUE' },
}

const RISK_CONFIG: Record<string, { label: string }> = {
  low:    { label: 'Low Risk' },
  medium: { label: 'Medium Risk' },
  high:   { label: 'High Risk' },
}

const ACTION_CONFIG: Record<string, { label: string }> = {
  pending:     { label: 'Pending' },
  placed:      { label: 'Placed' },
  skipped:     { label: 'Skipped' },
  watchlisted: { label: 'Watchlisted' },
  ignored:     { label: 'Ignored' },
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

function actionTone(action: string): BroadcastNoirStatus {
  return action === 'pending' || action === 'watchlisted' ? 'review' : 'neutral'
}

function linkedBetStatusTone(status: BetStatusKey): BroadcastNoirStatus {
  if (status === 'won') return 'success'
  if (status === 'lost') return 'negative'
  if (status === 'pending' || status === 'partial') return 'review'
  return 'neutral'
}

function ScoreBar({ score }: { score: number }) {
  const color = score < 0 ? 'bg-bn-negative' : 'bg-bn-data'
  return (
    <div className="mt-1 flex items-center gap-2" aria-label={`Factor score ${score > 0 ? `plus ${score}` : score} out of 3`}>
      <div aria-hidden="true" className="relative h-1.5 flex-1 rounded-control bg-bn-raised">
        <div className="absolute bottom-0 left-1/2 top-0 w-px bg-bn-border-strong" />
        <div
          className={`h-1.5 rounded-control ${color}`}
          style={{
            width: `${Math.abs(score) / 3 * 50}%`,
            marginLeft: score >= 0 ? '50%' : `${50 - Math.abs(score) / 3 * 50}%`,
          }}
        />
      </div>
      <span className="w-6 text-right font-mono text-xs text-bn-data">
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

  const currency = bankroll?.currency || 'USD'

  const d = decision as unknown as DecisionRow
  const rec    = d.recommendation ? REC_CONFIG[d.recommendation]   : null
  const risk   = d.risk_level     ? RISK_CONFIG[d.risk_level]      : null
  const action = ACTION_CONFIG[d.final_action] ?? ACTION_CONFIG.pending
  const linkedBet = d.bet_legs?.[0]?.bets ?? null
  const analysisOutput = d.ai_analysis_runs?.[0]?.output_json ?? null
  const researchSources = parseStoredAnalystResearchSources(analysisOutput?.research_sources)
  const parsedResearchBrief = parseStoredAnalystResearchBrief(analysisOutput?.research_brief)
  const researchBrief = parsedResearchBrief ? {
    ...parsedResearchBrief,
    sourcedClaims: bindAnalystSourcedClaims(parsedResearchBrief.sourcedClaims, researchSources),
  } : null
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
    <main className="bn-page mx-auto flex w-full max-w-4xl flex-col gap-4 pb-8">
      <PageView event={EVENTS.DECISION_DETAIL_VIEWED} props={{ sport: d.sport, final_action: d.final_action }} />
      <Link href="/decisions" className="bn-button bn-button-secondary w-fit">← Decisions</Link>

      <BroadcastPanel className="p-5 sm:p-7">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[11px] font-black uppercase tracking-[0.08em] text-bn-muted">{surface.sportLabel}</span>
          <BroadcastStatus status={actionTone(d.final_action)}>{surface.isTrustBlocked ? surface.actionLabel : action.label}</BroadcastStatus>
        </div>
        <div className="mt-4">
          <h1 className="break-words font-display text-[clamp(2rem,6vw,4.5rem)] font-black leading-[0.98] tracking-[-0.05em] text-bn-text">{d.event_name}</h1>
          <p className="mt-3 break-words text-sm leading-6 text-bn-muted">
            {d.market_type}{d.selection ? ` · ${d.selection}` : ''}{d.line != null ? ` · ${d.line}` : ''}
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            {d.offered_odds != null ? <BroadcastDataValue className="text-sm font-black">Odds {d.offered_odds.toFixed(2)}</BroadcastDataValue> : null}
            {(rec || surface.isTrustBlocked) && (
              <span className={`text-xs font-black uppercase tracking-[0.06em] ${showPricing ? 'text-bn-text' : 'text-bn-review'}`}>
                {showPricing ? `AI: ${rec?.label ?? surface.detailRecommendationLabel}` : surface.detailRecommendationLabel}
              </span>
            )}
            {risk ? <span className="text-xs text-bn-muted">{localizedRiskLabel(d.risk_level, risk.label, trustView)}</span> : null}
            <span className="text-xs text-bn-quiet">{date}</span>
          </div>
        </div>
      </BroadcastPanel>

      {researchBrief && Array.isArray(researchBrief.legs) && researchBrief.legs.length > 0 && (
        <section className="overflow-hidden rounded-control border border-bn-border-strong bg-bn-field text-bn-text" aria-labelledby="saved-research-heading">
          <div className="border-b border-bn-border-strong bg-bn-night px-5 py-5 sm:px-7">
            <p className="font-mono text-[11px] font-black uppercase tracking-[0.12em] text-bn-review">
              Conditional market review
            </p>
            <h2 id="saved-research-heading" className="mt-3 font-display text-3xl font-black leading-none tracking-[-0.04em] text-bn-text">
              {researchBrief.headline}
            </h2>
            <p className="mt-3 text-sm leading-6 text-bn-muted">{researchBrief.summary}</p>
            <p className="mt-3 border-l-2 border-bn-review pl-3 font-mono text-[11px] font-bold uppercase leading-5 tracking-[0.06em] text-bn-muted">
              Narrative analysis is conditional. Only verbatim excerpts under Cited claims are bound to current sources.
            </p>
          </div>

          {researchBrief.builderRisk && (
            <div className="border-b border-bn-review bg-bn-raised px-5 py-4 text-sm font-semibold leading-6 text-bn-review sm:px-7">
              <span className="font-mono text-[11px] font-black uppercase tracking-[0.1em]">Bet Builder correlation</span>
              <p className="mt-1">{researchBrief.builderRisk}</p>
            </div>
          )}

          <div className="divide-y divide-bn-border-strong">
            {researchBrief.legs.map(leg => (
              <article key={`${leg.legNumber}-${leg.eventName}-${leg.marketType}`} className="px-5 py-5 sm:px-7">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-mono text-[11px] font-black uppercase tracking-[0.1em] text-bn-quiet">Leg {leg.legNumber}</p>
                    <h3 className="mt-1 font-display text-xl font-black">{leg.eventName}</h3>
                    <p className="mt-1 text-sm text-bn-muted">{leg.marketType}{leg.selection ? ` · ${leg.selection}` : ''}</p>
                  </div>
                  <span className="rounded-control border border-bn-border-strong px-2 py-1 font-mono text-[11px] font-black uppercase tracking-[0.08em] text-bn-muted">
                    {leg.fixtureStatus.replaceAll('_', ' ')}
                  </span>
                </div>
                <p className="mt-3 text-sm font-semibold leading-6 text-bn-text">{leg.assessment}</p>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div>
                    <p className="mb-2 font-mono text-[11px] font-black uppercase tracking-[0.08em] text-bn-quiet">Conditional logic</p>
                    <ul className="space-y-1 text-sm text-bn-muted">
                    {leg.evidence.map((item, itemIndex) => <li key={`${itemIndex}-${item}`}>+ {item}</li>)}
                    </ul>
                  </div>
                  <div>
                    <p className="mb-2 font-mono text-[11px] font-black uppercase tracking-[0.08em] text-bn-quiet">Failure modes</p>
                    <ul className="space-y-1 text-sm text-bn-muted">
                    {leg.risks.map((item, itemIndex) => <li key={`${itemIndex}-${item}`}>− {item}</li>)}
                    </ul>
                  </div>
                </div>
              </article>
            ))}
          </div>

          <div className="border-t border-bn-border-strong px-5 py-5 sm:px-7">
            <p className="font-mono text-[11px] font-black uppercase tracking-[0.1em] text-bn-quiet">Analyst verdict</p>
            <p className="mt-2 text-base font-bold leading-6 text-bn-text">{researchBrief.verdict}</p>
          </div>

          {researchBrief.sourcedClaims.length > 0 && researchSources.length > 0 && (
            <div className="border-t border-bn-border-strong bg-bn-night px-5 py-4 sm:px-7">
              <p className="font-mono text-[11px] font-black uppercase tracking-[0.1em] text-bn-quiet">Cited claims — verbatim source excerpts</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {researchBrief.sourcedClaims.map((claim, claimIndex) => {
                  const source = researchSources.find(item => item.url === claim.sourceUrl)
                  if (!source) return null
                  return (
                  <a key={`${claimIndex}-${source.url}-${claim.text}`} href={source.url} target="_blank" rel="noopener noreferrer" className="rounded-control border border-bn-border-strong bg-bn-field px-3 py-3 text-sm font-bold text-bn-text underline underline-offset-4 hover:border-bn-signal hover:bg-bn-raised">
                    <span className="block no-underline">“{claim.text}”</span>
                    <span className="mt-2 block">{source.title}</span>
                    <span className="mt-1 block font-mono text-[11px] font-black uppercase tracking-[0.06em] text-bn-muted no-underline">
                      {new URL(source.url).hostname}
                    </span>
                  </a>
                  )
                })}
              </div>
            </div>
          )}
        </section>
      )}

      {/* AI Analysis card */}
      {(showPricing || surface.isTrustBlocked || d.reasoning) && (
        <BroadcastPanel className="flex flex-col gap-4 p-5 sm:p-7">
          <div className="font-mono text-[11px] font-black uppercase tracking-[0.08em] text-bn-muted">{trustView?.locale === 'uk' ? 'AI-аналіз' : 'AI Analysis'}</div>

          {/* Probabilities */}
          {showPricing && (
            <dl className="grid grid-cols-3 gap-3 text-center">
              <div>
                <dt className="mb-1 text-xs text-bn-muted">Model prob.</dt>
                <dd><BroadcastDataValue className="text-2xl font-black">{d.model_probability?.toFixed(1)}%</BroadcastDataValue></dd>
              </div>
              <div>
                <dt className="mb-1 text-xs text-bn-muted">Implied</dt>
                <dd><BroadcastDataValue className="text-2xl font-black">{d.implied_probability != null ? `${d.implied_probability.toFixed(1)}%` : '—'}</BroadcastDataValue></dd>
              </div>
              <div>
                <dt className="mb-1 text-xs text-bn-muted">Edge</dt>
                <dd><BroadcastDataValue className="text-2xl font-black">
                  {d.edge_percent != null
                    ? `${d.edge_percent >= 0 ? '+' : ''}${d.edge_percent.toFixed(1)}%`
                    : '—'}
                </BroadcastDataValue></dd>
              </div>
            </dl>
          )}

          {!showPricing && surface.isTrustBlocked && trustView && (
            <div className="rounded-control border border-bn-review bg-bn-raised px-4 py-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-bn-review">{trustView.riskWarningLabel}</div>
                  <div className="mt-1 text-lg font-bold text-bn-text">{trustView.label}</div>
                  <div className="mt-1 text-sm text-bn-muted">{trustView.supportLabel}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-bn-muted">{trustView.dataCoverageLabel}</div>
                  <BroadcastDataValue className="text-lg font-black">{trustView.dataCoverageScore}/100</BroadcastDataValue>
                </div>
              </div>
              {trustView.safeExplanation && (
                <p className="mt-3 text-xs leading-5 text-bn-muted">{trustView.safeExplanation}</p>
              )}
              {trustView.legs.length > 0 ? (
                <div className="mt-3">
                  <div className="mb-1 text-xs font-medium text-bn-review">{trustView.missingDataChecklistLabel}</div>
                  <div className="flex flex-col gap-2">
                    {trustView.legs.map(leg => (
                      <div key={`${leg.legLabel}-${leg.sport}-${leg.legNumber}`} className="rounded-control border border-bn-border-strong px-3 py-3 text-xs text-bn-muted">
                        <div className="font-medium">{leg.legLabel} / {leg.sportLabel}</div>
                        <div className="mt-1 text-bn-text">{leg.eventName}</div>
                        <div>{leg.marketType}{leg.selection ? ` / ${leg.selection}` : ''}</div>
                        {leg.periodOrPhase && (
                          <div>{trustView.locale === 'uk' ? 'Період / фаза' : 'Period / phase'}: {leg.periodOrPhase}</div>
                        )}
                        {leg.statusSourceLabel && (
                          <div>{trustView.locale === 'uk' ? 'Джерело статусу' : 'Status source'}: {leg.statusSourceLabel}</div>
                        )}
                        {leg.odds != null && (
                          <div>{trustView.locale === 'uk' ? 'Коефіцієнт' : 'Odds'}: {leg.odds}</div>
                        )}
                        <div className="mt-1 text-bn-review">{leg.fixtureStatusLabel} · {leg.supportLabel} · {leg.actionabilityLabel}</div>
                        <ul className="mt-1 list-disc pl-4 text-bn-muted">
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
                <span className="text-bn-muted">{trustView?.confidenceLabel ?? 'Confidence'}</span>
                <BroadcastDataValue>{d.confidence_score}/100</BroadcastDataValue>
              </div>
              <div className="h-1.5 rounded-control bg-bn-raised" role="img" aria-label={`${trustView?.confidenceLabel ?? 'Confidence'} ${d.confidence_score} out of 100`}>
                <div
                  aria-hidden="true"
                  className="h-1.5 rounded-control bg-bn-data"
                  style={{ width: `${d.confidence_score}%` }}
                />
              </div>
            </div>
          )}

          {/* Reasoning */}
          {d.reasoning && (
            <p className="text-sm leading-6 text-bn-muted">{trustView && !showPricing ? trustView.displayReasoning : d.reasoning}</p>
          )}
        </BroadcastPanel>
      )}

      {/* Factors */}
      {displayFactors.length > 0 && (
        <BroadcastPanel className="flex flex-col gap-2 p-5 sm:p-7">
          <h3 className="mb-1 text-sm font-semibold text-bn-text">{trustView?.factorAnalysisLabel ?? 'Factor Analysis'}</h3>
          {displayFactors.map((f: Factor, i: number) => (
            <div key={i} className="border-b border-bn-border-subtle py-2 last:border-0">
              <span className="text-sm text-bn-text">{f.name}</span>
              <ScoreBar score={f.score} />
              <p className="mt-1 text-xs text-bn-muted">{f.detail}</p>
            </div>
          ))}
        </BroadcastPanel>
      )}

      {/* Linked bet */}
      {linkedBet && (
        <BroadcastPanel className="p-5 sm:p-7">
          <div className="mb-3 font-mono text-[11px] font-black uppercase tracking-[0.08em] text-bn-muted">Linked Bet</div>
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <span className="text-bn-muted">Stake: <BroadcastDataValue className="font-medium">{formatMoney(linkedBet.stake, currency)}</BroadcastDataValue></span>
            <span className="text-bn-muted">Odds: <BroadcastDataValue className="font-medium">{linkedBet.total_odds ?? d.offered_odds}</BroadcastDataValue></span>
            <BroadcastStatus status={linkedBetStatusTone(resolveBetStatus(linkedBet.status).key)}>
              {resolveBetStatus(linkedBet.status).label}
            </BroadcastStatus>
          </div>
        </BroadcastPanel>
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
        <div className="text-center text-sm text-bn-muted">
          {surface.isTrustBlocked && surface.locale === 'uk' ? 'Це рішення позначено як ' : 'This decision was marked as '}
          <BroadcastStatus className="mx-1" status={actionTone(d.final_action)}>
            {surface.isTrustBlocked ? surface.actionLabel : action.label}
          </BroadcastStatus>
        </div>
      )}
    </main>
  )
}
