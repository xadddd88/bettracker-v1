import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { PageView } from '@/lib/analytics/PageView'
import { EVENTS } from '@/lib/analytics/events'
import {
  buildAnalystDecisionSurfaceView,
  type AnalysisQualityGateResult,
  type AnalystTrustView,
} from '@/lib/ai/analysis-quality-gate'

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
  bet:      { label: 'BET',      color: 'text-green-400'  },
  watch:    { label: 'WATCH',    color: 'text-yellow-400' },
  skip:     { label: 'SKIP',     color: 'text-gray-400'   },
  no_value: { label: 'NO VALUE', color: 'text-red-400'    },
}

const ACTION_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  pending:     { label: 'Pending',     color: 'text-gray-400',   bg: 'bg-gray-800 border-gray-700'     },
  placed:      { label: 'Placed',      color: 'text-green-400',  bg: 'bg-green-950 border-green-900'   },
  skipped:     { label: 'Skipped',     color: 'text-gray-500',   bg: 'bg-gray-900 border-gray-700'     },
  watchlisted: { label: 'Watchlisted', color: 'text-yellow-400', bg: 'bg-yellow-950 border-yellow-900' },
  ignored:     { label: 'Ignored',     color: 'text-gray-600',   bg: 'bg-gray-900 border-gray-800'     },
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
    <div className="flex flex-col gap-5">
      <PageView event={EVENTS.DECISIONS_LIST_VIEWED} props={{ filter, count: decisions.length }} />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white font-display">Decisions</h1>
          <p className="text-sm text-slate-500 mt-1">
            Every AI analysis saved here — {decisions.length} {filter === 'all' ? 'total' : filter}
          </p>
        </div>
        <Link href="/ai" className="btn-primary text-sm">+ Analyze</Link>
      </div>

      {/* Workflow note */}
      {filter === 'all' && decisions.length > 0 && (
        <p className="text-xs text-gray-600 px-0.5">Workflow: Analyse a match → place, watch, or skip → placed bets are tracked in Bets.</p>
      )}

      {/* Filter tabs */}
      <div className="flex gap-1 bg-gray-900 rounded-lg p-1 w-fit flex-wrap">
        {FILTERS.map(({ value, label }) => (
          <Link
            key={value}
            href={value === 'all' ? '/decisions' : `/decisions?filter=${value}`}
            className={`px-3 py-1.5 text-sm rounded-md font-medium transition-colors ${
              filter === value
                ? 'bg-amber-600/20 text-amber-400'
                : 'text-slate-400 hover:text-white hover:bg-gray-800'
            }`}
          >
            {label}
          </Link>
        ))}
      </div>

      {/* List */}
      {decisions.length === 0 ? (
        <div className="card text-center py-14">
          <div className="text-4xl mb-3">📋</div>
          {filter === 'all' ? (
            <>
              <p className="font-medium text-white mb-1">No decisions yet</p>
              <p className="text-slate-400 text-sm mb-5">
                Every AI analysis you run is saved here. Place, watch, or skip — all actions are tracked.
              </p>
              <Link href="/ai" className="btn-primary inline-flex text-sm">Analyse a match</Link>
            </>
          ) : (
            <p className="text-slate-400 text-sm">No {filter} decisions.</p>
          )}
        </div>
      ) : (
        <div className="card p-0 divide-y divide-gray-800">
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
            const recommendationColor = surface.isTrustBlocked ? 'text-amber-300' : rec?.color
            const actionLabel = surface.isTrustBlocked ? surface.actionLabel : action.label
            const date   = new Date(d.created_at).toLocaleDateString('en-GB', {
              day: '2-digit', month: 'short',
            })
            const market = [d.market_type, d.selection].filter(Boolean).join(' · ') || '—'

            return (
              <Link
                key={d.id}
                href={`/decisions/${d.id}`}
                className="flex items-center gap-4 px-4 py-3.5 hover:bg-gray-800/30 transition-colors"
              >
                {/* Sport icon */}
                <span className="shrink-0 w-12 text-center">
                  <span className="block text-xl">{icon}</span>
                  <span className="block text-[10px] text-slate-600 truncate">{surface.sportLabel}</span>
                </span>

                {/* Event + market */}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-white truncate">{d.event_name}</div>
                  <div className="text-xs text-slate-500 mt-0.5 truncate">
                    {market}
                    {d.offered_odds ? ` · @${d.offered_odds}` : ''}
                  </div>
                </div>

                {/* AI recommendation */}
                {recommendationLabel && (
                  <span className={`text-xs font-semibold shrink-0 hidden sm:block ${recommendationColor ?? 'text-slate-400'}`}>
                    {recommendationLabel}
                  </span>
                )}

                {/* Confidence */}
                <div className="shrink-0 hidden md:block w-10 text-right">
                  {d.confidence_score != null ? (
                    <span className="text-xs text-slate-400 font-mono">{d.confidence_score}%</span>
                  ) : (
                    <span className="text-xs text-slate-700">—</span>
                  )}
                </div>

                {/* Date */}
                <span className="text-xs text-slate-600 shrink-0 hidden sm:block">{date}</span>

                {/* Action badge */}
                <span className={`text-xs px-2.5 py-1 rounded-full font-medium border shrink-0 ${action.bg} ${action.color}`}>
                  {actionLabel}
                </span>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
