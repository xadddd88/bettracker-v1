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
import { resolveBetStatus, type BetStatusKey } from '@/lib/bets/bet-status'
import {
  bindAnalystSourcedClaims,
  parseStoredAnalystResearchBrief,
  parseStoredAnalystResearchSources,
} from '@/lib/ai/analyst-research'
import { BroadcastDataValue } from '@/components/ui/BroadcastNoir'

// Canonical resolver keys (Decision #058): explicit color for every status —
// unknown values render as 'Unknown', never as raw text or a settled look.
const LINKED_BET_STATUS_TEXT: Record<BetStatusKey, string> = {
  won:        'text-[var(--success)]',
  lost:       'text-[var(--negative)]',
  pending:    'text-[var(--review)]',
  void:       'text-[var(--text-muted)]',
  push:       'text-[var(--text-muted)]',
  cashed_out: 'text-[var(--text-muted)]',
  partial:    'text-[var(--text-primary)]',
  unknown:    'text-[var(--text-muted)]',
}

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

const REC_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  bet:      { label: 'BET',      color: 'text-[var(--text-primary)]', bg: 'border-[var(--border-strong)]' },
  watch:    { label: 'WATCH',    color: 'text-[var(--review)]', bg: 'border-[var(--review)]' },
  skip:     { label: 'SKIP',     color: 'text-[var(--text-muted)]', bg: 'border-[var(--border-strong)]' },
  no_value: { label: 'NO VALUE', color: 'text-[var(--negative)]', bg: 'border-[var(--negative)]' },
}

const RISK_CONFIG: Record<string, { label: string; color: string }> = {
  low:    { label: 'Low Risk',    color: 'text-[var(--text-muted)]' },
  medium: { label: 'Medium Risk', color: 'text-[var(--review)]' },
  high:   { label: 'High Risk',   color: 'text-[var(--negative)]' },
}

const ACTION_CONFIG: Record<string, { label: string; color: string }> = {
  pending:     { label: 'Pending',     color: 'text-[var(--text-muted)]' },
  placed:      { label: 'Placed',      color: 'text-[var(--success)]' },
  skipped:     { label: 'Skipped',     color: 'text-[var(--text-muted)]' },
  watchlisted: { label: 'Watchlisted', color: 'text-[var(--review)]' },
  ignored:     { label: 'Ignored',     color: 'text-[var(--text-muted)]' },
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
  const color = score > 0 ? 'bg-[var(--success)]' : score < 0 ? 'bg-[var(--negative)]' : 'bg-[var(--border-strong)]'
  return (
    <div className="flex items-center gap-2 mt-0.5">
      <div className="relative h-1.5 flex-1 bg-[var(--field-raised)]">
        <div className="absolute bottom-0 left-1/2 top-0 w-px bg-[var(--border-strong)]" />
        <div
          className={`h-1.5 ${color}`}
          style={{
            width: `${Math.abs(score) / 3 * 50}%`,
            marginLeft: score >= 0 ? '50%' : `${50 - Math.abs(score) / 3 * 50}%`,
          }}
        />
      </div>
      <span className={`w-6 text-right font-mono text-xs ${score > 0 ? 'text-[var(--success)]' : score < 0 ? 'text-[var(--negative)]' : 'text-[var(--text-muted)]'}`}>
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
    <div className="bn-page max-w-3xl flex flex-col gap-5">
      <PageView event={EVENTS.DECISION_DETAIL_VIEWED} props={{ sport: d.sport, final_action: d.final_action }} />
      {/* Back */}
      <Link href="/decisions" className="inline-flex min-h-11 items-center text-sm font-bold text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]">
        ← Back to Decisions
      </Link>

      {/* Header */}
      <div className="flex items-start gap-3">
        <span className="mt-1 self-start border border-[var(--border-strong)] bg-[var(--field-raised)] px-2 py-1 font-mono text-[11px] font-bold text-[var(--text-muted)]">{surface.sportLabel}</span>
        <div className="min-w-0">
          <h1 className="break-words font-display text-2xl font-black leading-tight text-[var(--text-primary)]">{d.event_name}</h1>
          <p className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-sm text-[var(--text-muted)]">
            <span>{d.market_type}{d.selection ? ` · ${d.selection}` : ''}{d.line != null ? ` · ${d.line}` : ''}</span>
            {d.offered_odds ? <span>Odds <BroadcastDataValue>{d.offered_odds}</BroadcastDataValue></span> : null}
          </p>
          <div className="flex items-center gap-3 mt-1">
            <span className={`text-xs font-medium ${action.color}`}>{surface.isTrustBlocked ? surface.actionLabel : action.label}</span>
            {(rec || surface.isTrustBlocked) && (
              <span className={`text-xs font-semibold ${showPricing ? rec?.color ?? 'text-[var(--text-muted)]' : 'text-[var(--review)]'}`}>
                {showPricing ? `AI: ${rec?.label ?? surface.detailRecommendationLabel}` : surface.detailRecommendationLabel}
              </span>
            )}
            {risk && <span className={`text-xs ${risk.color}`}>{localizedRiskLabel(d.risk_level, risk.label, trustView)}</span>}
            <span className="text-xs text-[var(--text-muted)]">{date}</span>
          </div>
        </div>
      </div>

      {researchBrief && Array.isArray(researchBrief.legs) && researchBrief.legs.length > 0 && (
        <section className="bn-panel overflow-hidden" aria-labelledby="saved-research-heading">
          <div className="border-b border-[var(--border-strong)] bg-[var(--field-raised)] px-5 py-5">
            <p className="editorial-kicker text-[var(--signal)]">
              Conditional market review
            </p>
            <h2 id="saved-research-heading" className="mt-3 font-display text-3xl font-black leading-none text-[var(--text-primary)]">
              {researchBrief.headline}
            </h2>
            <p className="mt-3 text-sm leading-6 text-[var(--text-muted)]">{researchBrief.summary}</p>
            <p className="mt-3 border-l-2 border-[var(--signal)] pl-3 font-mono text-[11px] font-bold uppercase leading-5 tracking-[0.08em] text-[var(--text-muted)]">
              Narrative analysis is conditional. Only verbatim excerpts under Cited claims are bound to current sources.
            </p>
          </div>

          {researchBrief.builderRisk && (
            <div className="border-b border-[var(--review)] bg-[var(--field)] px-5 py-4 text-sm font-semibold leading-6 text-[var(--review)]">
              <span className="font-mono text-[11px] font-black uppercase tracking-[0.14em]">! Bet Builder correlation</span>
              <p className="mt-1">{researchBrief.builderRisk}</p>
            </div>
          )}

          <div className="divide-y divide-[var(--border-subtle)]">
            {researchBrief.legs.map(leg => (
              <article key={`${leg.legNumber}-${leg.eventName}-${leg.marketType}`} className="px-5 py-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="editorial-kicker">Leg {leg.legNumber}</p>
                    <h3 className="mt-1 break-words font-display text-xl font-black text-[var(--text-primary)]">{leg.eventName}</h3>
                    <p className="mt-1 text-sm text-[var(--text-muted)]">{leg.marketType}{leg.selection ? ` · ${leg.selection}` : ''}</p>
                  </div>
                  <span className="bn-status bn-status-neutral">
                    <span className="bn-status-icon" aria-hidden>•</span>
                    {leg.fixtureStatus.replaceAll('_', ' ')}
                  </span>
                </div>
                <p className="mt-3 text-sm font-semibold leading-6 text-[var(--text-primary)]">{leg.assessment}</p>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div>
                    <p className="editorial-kicker mb-2">Conditional logic</p>
                    <ul className="space-y-1 text-sm text-[var(--text-muted)]">
                    {leg.evidence.map((item, itemIndex) => <li key={`${itemIndex}-${item}`}>+ {item}</li>)}
                    </ul>
                  </div>
                  <div>
                    <p className="editorial-kicker mb-2">Failure modes</p>
                    <ul className="space-y-1 text-sm text-[var(--text-muted)]">
                    {leg.risks.map((item, itemIndex) => <li key={`${itemIndex}-${item}`}>− {item}</li>)}
                    </ul>
                  </div>
                </div>
              </article>
            ))}
          </div>

          <div className="border-t border-[var(--border-strong)] px-5 py-5">
            <p className="editorial-kicker">Analyst verdict</p>
            <p className="mt-2 text-base font-bold leading-6 text-[var(--text-primary)]">{researchBrief.verdict}</p>
          </div>

          {researchBrief.sourcedClaims.length > 0 && researchSources.length > 0 && (
            <div className="border-t border-[var(--border-strong)] bg-[var(--field-raised)] px-5 py-4">
              <p className="editorial-kicker">Cited claims — verbatim source excerpts</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {researchBrief.sourcedClaims.map((claim, claimIndex) => {
                  const source = researchSources.find(item => item.url === claim.sourceUrl)
                  if (!source) return null
                  return (
                  <a key={`${claimIndex}-${source.url}-${claim.text}`} href={source.url} target="_blank" rel="noopener noreferrer" className="border border-[var(--border-strong)] bg-[var(--field)] px-3 py-3 text-sm font-bold text-[var(--text-primary)] underline underline-offset-4 transition-colors hover:border-[var(--signal)]">
                    <span className="block no-underline">“{claim.text}”</span>
                    <span className="mt-2 block">{source.title}</span>
                    <span className="mt-1 block font-mono text-[11px] font-black uppercase tracking-[0.08em] text-[var(--text-muted)] no-underline">
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
        <div className={`bn-panel flex flex-col gap-4 border p-4 sm:p-5 ${rec?.bg ?? 'border-[var(--border-strong)]'}`}>
          <div className="editorial-kicker">{trustView?.locale === 'uk' ? 'AI-аналіз' : 'AI Analysis'}</div>

          {/* Probabilities */}
          {showPricing && (
            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <div className="mb-0.5 text-xs text-[var(--text-muted)]">Model prob.</div>
                <BroadcastDataValue className="text-2xl font-bold">{d.model_probability?.toFixed(1)}%</BroadcastDataValue>
              </div>
              <div>
                <div className="mb-0.5 text-xs text-[var(--text-muted)]">Implied</div>
                <BroadcastDataValue className="text-2xl font-bold">
                  {d.implied_probability != null ? `${d.implied_probability.toFixed(1)}%` : '—'}
                </BroadcastDataValue>
              </div>
              <div>
                <div className="mb-0.5 text-xs text-[var(--text-muted)]">Edge</div>
                <div className={`text-2xl font-bold ${(d.edge_percent ?? 0) >= 0 ? 'text-[var(--success)]' : 'text-[var(--negative)]'}`}>
                  {d.edge_percent != null
                    ? `${d.edge_percent >= 0 ? '+' : ''}${d.edge_percent.toFixed(1)}%`
                    : '—'}
                </div>
              </div>
            </div>
          )}

          {!showPricing && surface.isTrustBlocked && trustView && (
            <div className="border border-[var(--review)] bg-[var(--field-raised)] px-3 py-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-[var(--review)]">! {trustView.riskWarningLabel}</div>
                  <div className="mt-1 text-lg font-bold text-[var(--text-primary)]">{trustView.label}</div>
                  <div className="mt-1 text-sm text-[var(--text-muted)]">{trustView.supportLabel}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-[var(--review)]">{trustView.dataCoverageLabel}</div>
                  <div className="text-lg font-bold text-[var(--data-value)]">{trustView.dataCoverageScore}/100</div>
                </div>
              </div>
              {trustView.safeExplanation && (
                <p className="mt-3 text-xs text-[var(--text-muted)]">{trustView.safeExplanation}</p>
              )}
              {trustView.legs.length > 0 ? (
                <div className="mt-3">
                  <div className="mb-1 text-xs font-medium text-[var(--review)]">{trustView.missingDataChecklistLabel}</div>
                  <div className="flex flex-col gap-2">
                    {trustView.legs.map(leg => (
                      <div key={`${leg.legLabel}-${leg.sport}-${leg.legNumber}`} className="border border-[var(--border-subtle)] px-3 py-3 text-xs text-[var(--text-muted)]">
                        <div className="font-medium">{leg.legLabel} / {leg.sportLabel}</div>
                        <div className="mt-1 text-[var(--text-muted)]">{leg.eventName}</div>
                        <div className="text-[var(--text-muted)]">{leg.marketType}{leg.selection ? ` / ${leg.selection}` : ''}</div>
                        {leg.periodOrPhase && (
                          <div>{trustView.locale === 'uk' ? 'Період / фаза' : 'Period / phase'}: {leg.periodOrPhase}</div>
                        )}
                        {leg.statusSourceLabel && (
                          <div>{trustView.locale === 'uk' ? 'Джерело статусу' : 'Status source'}: {leg.statusSourceLabel}</div>
                        )}
                        {leg.odds != null && (
                          <div>{trustView.locale === 'uk' ? 'Коефіцієнт' : 'Odds'}: <BroadcastDataValue>{leg.odds}</BroadcastDataValue></div>
                        )}
                        <div className="mt-1 text-[var(--review)]">! {leg.fixtureStatusLabel} · {leg.supportLabel} · {leg.actionabilityLabel}</div>
                        <ul className="mt-1 list-disc pl-4 text-[var(--text-muted)]">
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
                <span className="text-[var(--text-muted)]">{trustView?.confidenceLabel ?? 'Confidence'}</span>
                <span className="text-[var(--data-value)]">{d.confidence_score}/100</span>
              </div>
              <div className="h-1.5 bg-[var(--field-raised)]">
                <div
                  className="h-1.5 bg-[var(--border-strong)]"
                  style={{ width: `${d.confidence_score}%` }}
                />
              </div>
            </div>
          )}

          {/* Reasoning */}
          {d.reasoning && (
            <p className="text-sm leading-relaxed text-[var(--text-primary)]">{trustView && !showPricing ? trustView.displayReasoning : d.reasoning}</p>
          )}
        </div>
      )}

      {/* Factors */}
      {displayFactors.length > 0 && (
        <div className="bn-panel flex flex-col gap-2 p-4 sm:p-5">
          <h3 className="editorial-kicker mb-1">{trustView?.factorAnalysisLabel ?? 'Factor Analysis'}</h3>
          {displayFactors.map((f: Factor, i: number) => (
            <div key={i} className="border-b border-[var(--border-subtle)] py-2 last:border-0">
              <span className="text-sm text-[var(--text-primary)]">{f.name}</span>
              <ScoreBar score={f.score} />
              <p className="mt-1 text-xs text-[var(--text-muted)]">{f.detail}</p>
            </div>
          ))}
        </div>
      )}

      {/* Linked bet */}
      {linkedBet && (
        <div className="bn-panel p-4 sm:p-5">
          <div className="editorial-kicker mb-2">Linked Bet</div>
          <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-3 sm:items-center">
            <span className="text-[var(--text-muted)]">Stake: <BroadcastDataValue>{stakeSymbol}{linkedBet.stake}</BroadcastDataValue></span>
            <span className="text-[var(--text-muted)]">Odds: <BroadcastDataValue>{linkedBet.total_odds ?? d.offered_odds}</BroadcastDataValue></span>
            <span className={`font-medium ${LINKED_BET_STATUS_TEXT[resolveBetStatus(linkedBet.status).key]}`}>
              {resolveBetStatus(linkedBet.status).label}
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
        <div className="text-center text-sm text-[var(--text-muted)]">
          {surface.isTrustBlocked && surface.locale === 'uk' ? 'Це рішення позначено як ' : 'This decision was marked as '}
          <span className={`font-medium ${action.color}`}>
            {surface.isTrustBlocked ? surface.actionLabel.toLowerCase() : action.label.toLowerCase()}
          </span>.
        </div>
      )}
    </div>
  )
}
