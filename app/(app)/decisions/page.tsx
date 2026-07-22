import Link from 'next/link'

import {
  BroadcastDataValue,
  BroadcastPanel,
  BroadcastStatus,
} from '@/components/ui/BroadcastNoir'
import { EVENTS } from '@/lib/analytics/events'
import { PageView } from '@/lib/analytics/PageView'
import {
  buildAnalystDecisionSurfaceView,
  type AnalysisQualityGateResult,
  type AnalystTrustView,
} from '@/lib/ai/analysis-quality-gate'
import { createClient } from '@/lib/supabase/server'
import type { BroadcastNoirStatus } from '@/lib/ui/broadcast-noir'

type Filter = 'all' | 'watchlisted' | 'pending' | 'placed' | 'skipped'

interface AnalysisRunRow {
  output_json: {
    edge_bucket?: string | null
    quality_gate?: AnalysisQualityGateResult | null
    trust_view?: AnalystTrustView | null
  } | null
}

interface DecisionListRow {
  ai_analysis_runs: AnalysisRunRow[] | null
  confidence_score: number | null
  created_at: string
  edge_percent: number | null
  event_name: string
  final_action: string
  id: string
  implied_probability: number | null
  market_type: string | null
  model_probability: number | null
  offered_odds: number | null
  output_language: string | null
  recommendation: string | null
  selection: string | null
  sport: string | null
}

const FILTERS: Array<{ label: string; value: Filter }> = [
  { label: 'All', value: 'all' },
  { label: 'Watchlisted', value: 'watchlisted' },
  { label: 'Pending', value: 'pending' },
  { label: 'Placed', value: 'placed' },
  { label: 'Skipped', value: 'skipped' },
]

const ACTION_LABEL: Record<string, string> = {
  ignored: 'Ignored',
  pending: 'Pending',
  placed: 'Placed',
  skipped: 'Skipped',
  watchlisted: 'Watchlisted',
}

const RECOMMENDATION_LABEL: Record<string, string> = {
  bet: 'BET',
  no_value: 'NO VALUE',
  skip: 'SKIP',
  watch: 'WATCH',
}

export default async function DecisionsPage({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const { filter: raw } = await searchParams
  const filter: Filter = FILTERS.some(({ value }) => value === raw) ? raw as Filter : 'all'
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let query = supabase
    .from('decisions')
    .select(`
      id, sport, event_name, market_type, selection, offered_odds,
      recommendation, final_action, confidence_score,
      model_probability, implied_probability, edge_percent,
      output_language, created_at,
      ai_analysis_runs(output_json)
    `)
    .eq('user_id', user!.id)
    .order('created_at', { ascending: false })

  if (filter !== 'all') query = query.eq('final_action', filter)
  const { data } = await query
  const decisions = (data ?? []) as unknown as DecisionListRow[]

  return (
    <main className="bn-page mx-auto flex w-full max-w-5xl flex-col gap-4 pb-8">
      <PageView event={EVENTS.DECISIONS_LIST_VIEWED} props={{ filter, count: decisions.length }} />

      <BroadcastPanel className="grid gap-6 p-5 sm:p-7 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div>
          <p className="editorial-kicker">Decision archive · persisted analyses</p>
          <h1 className="mt-3 font-display text-[clamp(2.75rem,8vw,6rem)] font-black leading-none tracking-[-0.06em] text-bn-text">Decisions</h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-bn-muted">{decisions.length} {filter === 'all' ? 'records' : filter} in the current view.</p>
        </div>
        <Link className="bn-button bn-button-primary" href="/ai">Analyze</Link>
      </BroadcastPanel>

      <nav aria-label="Decision filters" className="flex max-w-full gap-1 overflow-x-auto rounded-control border border-bn-border-strong bg-bn-field p-1">
        {FILTERS.map(({ label, value }) => (
          <Link
            aria-current={filter === value ? 'page' : undefined}
            className={`bn-button shrink-0 ${filter === value ? 'bn-button-primary' : 'bn-button-secondary'}`}
            href={value === 'all' ? '/decisions' : `/decisions?filter=${value}`}
            key={value}
          >
            {label}
          </Link>
        ))}
      </nav>

      {decisions.length === 0 ? (
        <BroadcastPanel className="grid min-h-72 place-items-center p-6 text-center">
          <div className="max-w-md">
            <BroadcastStatus status="neutral">Empty · no {filter === 'all' ? '' : `${filter} `}decisions</BroadcastStatus>
            <h2 className="mt-5 font-display text-3xl font-black tracking-[-0.04em] text-bn-text">No records in this view</h2>
            <p className="mt-3 text-sm leading-6 text-bn-muted">An analysis is saved here only through the existing decision contract.</p>
            {filter === 'all' ? <Link className="bn-button bn-button-primary mt-6" href="/ai">Analyze a match</Link> : null}
          </div>
        </BroadcastPanel>
      ) : (
        <ol aria-label="Saved decisions" className="space-y-3">
          {decisions.map((decision) => {
            const analysisOutput = decision.ai_analysis_runs?.[0]?.output_json ?? null
            const surface = buildAnalystDecisionSurfaceView({
              confidenceScore: decision.confidence_score,
              edgeBucket: analysisOutput?.edge_bucket,
              edgePercent: decision.edge_percent,
              eventName: decision.event_name,
              finalAction: decision.final_action,
              impliedProbability: decision.implied_probability,
              locale: decision.output_language,
              marketType: decision.market_type ?? '',
              modelProbability: decision.model_probability,
              offeredOdds: decision.offered_odds,
              qualityGate: analysisOutput?.quality_gate ?? null,
              recommendation: decision.recommendation,
              selection: decision.selection,
              sport: decision.sport,
              trustView: analysisOutput?.trust_view ?? null,
            })
            const recommendation = surface.isTrustBlocked
              ? surface.listRecommendationLabel
              : decision.recommendation
                ? RECOMMENDATION_LABEL[decision.recommendation]
                : null
            const actionLabel = surface.isTrustBlocked
              ? surface.actionLabel
              : ACTION_LABEL[decision.final_action] ?? 'Pending'

            return (
              <li key={decision.id}>
                <Link className="block" href={`/decisions/${decision.id}`}>
                  <BroadcastPanel className="grid gap-4 p-5 transition-colors hover:bg-bn-raised sm:p-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-[11px] font-black uppercase tracking-[0.08em] text-bn-muted">{surface.sportLabel}</span>
                        <BroadcastStatus status={actionTone(decision.final_action)}>{actionLabel}</BroadcastStatus>
                      </div>
                      <h2 className="mt-4 break-words font-display text-xl font-black tracking-[-0.035em] text-bn-text">{decision.event_name}</h2>
                      <p className="mt-2 break-words text-sm leading-6 text-bn-muted">
                        {[decision.market_type, decision.selection].filter(Boolean).join(' · ') || 'Market not recorded'}
                      </p>
                      {recommendation ? (
                        <p className={`mt-3 text-xs font-black uppercase tracking-[0.08em] ${surface.isTrustBlocked ? 'text-bn-review' : 'text-bn-text'}`}>
                          {recommendation}
                        </p>
                      ) : null}
                    </div>

                    <dl className="grid grid-cols-3 gap-4 border-t border-bn-border-subtle pt-4 lg:min-w-64 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
                      <DataPoint label="Odds" value={decision.offered_odds?.toFixed(2) ?? '—'} />
                      <DataPoint label="Confidence" value={decision.confidence_score == null ? '—' : `${decision.confidence_score}/100`} />
                      <DataPoint label="Saved" value={formatDate(decision.created_at)} />
                    </dl>
                  </BroadcastPanel>
                </Link>
              </li>
            )
          })}
        </ol>
      )}
    </main>
  )
}

function DataPoint({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0"><dt className="font-mono text-[11px] font-bold uppercase tracking-[0.05em] text-bn-quiet">{label}</dt><dd><BroadcastDataValue className="mt-1 block break-words text-sm font-black">{value}</BroadcastDataValue></dd></div>
}

function actionTone(action: string): BroadcastNoirStatus {
  return action === 'pending' || action === 'watchlisted' ? 'review' : 'neutral'
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value))
}
