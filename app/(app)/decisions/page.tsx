import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { PageView } from '@/lib/analytics/PageView'
import { EVENTS } from '@/lib/analytics/events'
import {
  buildAnalystDecisionSurfaceView,
  type AnalysisQualityGateResult,
  type AnalystTrustView,
} from '@/lib/ai/analysis-quality-gate'
import { BroadcastDataValue } from '@/components/ui/BroadcastNoir'

type Filter = 'all' | 'watchlisted' | 'pending' | 'placed' | 'skipped'

interface AnalysisRunRow {
  output_json: {
    quality_gate?: AnalysisQualityGateResult | null
    trust_view?: AnalystTrustView | null
    edge_bucket?: string | null
  } | null
}

interface DecisionListRow {
  id: string
  sport: string | null
  event_name: string
  market_type: string | null
  selection: string | null
  offered_odds: number | null
  recommendation: string | null
  final_action: string
  confidence_score: number | null
  model_probability: number | null
  implied_probability: number | null
  edge_percent: number | null
  output_language: string | null
  created_at: string
  ai_analysis_runs: AnalysisRunRow[] | null
}

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all',         label: 'All' },
  { value: 'watchlisted', label: 'Watchlisted' },
  { value: 'pending',     label: 'Pending' },
  { value: 'placed',      label: 'Placed' },
  { value: 'skipped',     label: 'Skipped' },
]

const REC_CONFIG: Record<string, { label: string; color: string }> = {
  bet:      { label: 'BET',      color: 'text-[var(--text-primary)]' },
  watch:    { label: 'WATCH',    color: 'text-[var(--review)]' },
  skip:     { label: 'SKIP',     color: 'text-[var(--text-muted)]' },
  no_value: { label: 'NO VALUE', color: 'text-[var(--negative)]' },
}

const ACTION_CONFIG: Record<string, { label: string; style: string; symbol: string }> = {
  pending:     { label: 'Pending',     style: 'bn-status-neutral', symbol: '•' },
  placed:      { label: 'Placed',      style: 'bn-status-success', symbol: '✓' },
  skipped:     { label: 'Skipped',     style: 'bn-status-neutral', symbol: '—' },
  watchlisted: { label: 'Watchlisted', style: 'bn-status-review', symbol: '!' },
  ignored:     { label: 'Ignored',     style: 'bn-status-neutral', symbol: '•' },
}

const SPORT_ICONS: Record<string, string> = {
  soccer: '⚽', football: '⚽', tennis: '🎾', basketball: '🏀',
  ice_hockey: '🏒', hockey: '🏒', cs2: '🎯', mma: '🥊', other: '🏅',
}

const VALID_FILTERS = new Set<string>(['all', 'watchlisted', 'pending', 'placed', 'skipped'])

export default async function DecisionsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>
}) {
  const { filter: raw } = await searchParams
  const filter: Filter  = VALID_FILTERS.has(raw ?? '') ? (raw as Filter) : 'all'

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
    <div className="bn-page flex flex-col gap-5">
      <PageView event={EVENTS.DECISIONS_LIST_VIEWED} props={{ filter, count: decisions.length }} />

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="editorial-kicker">Decision log</p>
          <h1 className="mt-2 font-display text-3xl font-black text-[var(--text-primary)]">Decisions</h1>
          <p className="mt-2 text-sm text-[var(--text-muted)]">
            Every AI analysis saved here — {decisions.length} {filter === 'all' ? 'total' : filter}
          </p>
        </div>
        <Link href="/ai" className="bn-button bn-button-primary w-full sm:w-auto">Analyze</Link>
      </div>

      {/* Workflow note */}
      {filter === 'all' && decisions.length > 0 && (
        <p className="border-l-2 border-[var(--border-strong)] px-3 text-xs text-[var(--text-muted)]">Workflow: Analyze a match → place, watch, or skip → placed bets are tracked in Bets.</p>
      )}

      {/* Filter tabs */}
      <div className="flex w-full flex-wrap gap-1 border border-[var(--border-strong)] bg-[var(--field)] p-1 sm:w-fit">
        {FILTERS.map(({ value, label }) => (
          <Link
            key={value}
            href={value === 'all' ? '/decisions' : `/decisions?filter=${value}`}
            className={`inline-flex min-h-11 flex-1 items-center justify-center px-3 text-xs font-extrabold uppercase tracking-[0.06em] transition-colors sm:flex-none ${
              filter === value
                ? 'bg-[var(--signal)] text-[var(--on-signal)]'
                : 'text-[var(--text-muted)] hover:bg-[var(--field-raised)] hover:text-[var(--text-primary)]'
            }`}
          >
            {label}
          </Link>
        ))}
      </div>

      {/* List */}
      {decisions.length === 0 ? (
        <div className="bn-panel px-5 py-14 text-center">
          <p className="editorial-kicker mb-2">No records</p>
          {filter === 'all' ? (
            <>
              <p className="mb-1 font-medium text-[var(--text-primary)]">No decisions yet</p>
              <p className="mb-5 text-sm text-[var(--text-muted)]">
                Every AI analysis you run is saved here. Place, watch, or skip — all actions are tracked.
              </p>
              <Link href="/ai" className="bn-button bn-button-primary">Analyze a match</Link>
            </>
          ) : (
            <p className="text-sm text-[var(--text-muted)]">No {filter} decisions.</p>
          )}
        </div>
      ) : (
        <div className="bn-panel divide-y divide-[var(--border-subtle)] overflow-hidden">
          {decisions.map((d) => {
            const rec    = d.recommendation ? REC_CONFIG[d.recommendation] : null
            const action = ACTION_CONFIG[d.final_action] ?? ACTION_CONFIG.pending
            const icon   = SPORT_ICONS[d.sport ?? ''] ?? '🏅'
            const analysisOutput = d.ai_analysis_runs?.[0]?.output_json ?? null
            const qualityGate = analysisOutput?.quality_gate ?? null
            const trustView = analysisOutput?.trust_view ?? null
            const surface = buildAnalystDecisionSurfaceView({
              qualityGate,
              trustView,
              locale:             d.output_language,
              sport:              d.sport,
              eventName:          d.event_name,
              marketType:         d.market_type ?? '',
              selection:          d.selection,
              offeredOdds:        d.offered_odds,
              recommendation:     d.recommendation,
              finalAction:        d.final_action,
              confidenceScore:    d.confidence_score,
              modelProbability:   d.model_probability,
              impliedProbability: d.implied_probability,
              edgePercent:        d.edge_percent,
              edgeBucket:         analysisOutput?.edge_bucket,
            })
            const recommendationLabel = surface.isTrustBlocked ? surface.listRecommendationLabel : rec?.label
            const recommendationColor = surface.isTrustBlocked ? 'text-[var(--review)]' : rec?.color
            const actionLabel = surface.isTrustBlocked ? surface.actionLabel : action.label
            const date   = new Date(d.created_at).toLocaleDateString('en-GB', {
              day: '2-digit', month: 'short',
            })
            const market = [d.market_type, d.selection].filter(Boolean).join(' · ') || '—'

            return (
              <Link
                key={d.id}
                href={`/decisions/${d.id}`}
                className="grid grid-cols-[auto_minmax(0,1fr)] gap-3 px-4 py-4 transition-colors hover:bg-[var(--field-raised)] sm:grid-cols-[auto_minmax(0,1fr)_auto_auto] sm:items-center"
              >
                {/* Sport icon */}
                <span className="w-12 shrink-0 text-center">
                  <span className="block text-xl">{icon}</span>
                  <span className="block truncate text-[11px] text-[var(--text-muted)]">{surface.sportLabel}</span>
                </span>

                {/* Event + market */}
                <div className="flex-1 min-w-0">
                  <div className="break-words text-sm font-bold text-[var(--text-primary)]">{d.event_name}</div>
                  <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-xs text-[var(--text-muted)]">
                    <span>{market}</span>
                    {d.offered_odds ? <span>Odds <BroadcastDataValue>{d.offered_odds}</BroadcastDataValue></span> : null}
                    <span className="sm:hidden">{date}</span>
                  </div>
                </div>

                {/* AI recommendation */}
                {recommendationLabel && (
                  <span className={`hidden shrink-0 text-xs font-semibold sm:block ${recommendationColor ?? 'text-[var(--text-muted)]'}`}>
                    {recommendationLabel}
                  </span>
                )}

                {/* Confidence */}
                <div className="hidden w-12 shrink-0 text-right md:block">
                  {d.confidence_score != null ? (
                    <span className="font-mono text-xs text-[var(--data-value)]">{d.confidence_score}%</span>
                  ) : (
                    <span className="text-xs text-[var(--text-muted)]">—</span>
                  )}
                </div>

                {/* Date */}
                {/* Action badge */}
                <span className={`bn-status col-start-2 row-start-2 w-fit shrink-0 sm:col-start-auto sm:row-start-auto ${action.style}`}>
                  <span className="bn-status-icon" aria-hidden>{action.symbol}</span><span>{actionLabel}</span>
                </span>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
