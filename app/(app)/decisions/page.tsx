import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { PageView } from '@/lib/analytics/PageView'
import { EVENTS } from '@/lib/analytics/events'

type Filter = 'all' | 'watchlisted' | 'pending' | 'placed' | 'skipped'

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
    .select('id, sport, event_name, market_type, selection, offered_odds, recommendation, final_action, confidence_score, created_at')
    .eq('user_id', user!.id)
    .order('created_at', { ascending: false })

  if (filter !== 'all') query = query.eq('final_action', filter)

  const { data } = await query
  const decisions = data ?? []

  return (
    <div className="flex flex-col gap-5">
      <PageView event={EVENTS.DECISIONS_LIST_VIEWED} props={{ filter, count: decisions.length }} />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white font-display">Decisions</h1>
          <p className="text-sm text-slate-500 mt-1">
            {decisions.length} {filter === 'all' ? 'total' : filter}
          </p>
        </div>
        <Link href="/ai" className="btn-primary text-sm">+ Analyze</Link>
      </div>

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
          <p className="text-slate-400 text-sm mb-4">
            {filter === 'all'
              ? 'No decisions yet. Run the AI Analyst to create your first.'
              : `No ${filter} decisions.`}
          </p>
          {filter === 'all' && (
            <Link href="/ai" className="btn-primary inline-flex text-sm">Analyze a match</Link>
          )}
        </div>
      ) : (
        <div className="card p-0 divide-y divide-gray-800">
          {decisions.map((d) => {
            const rec    = d.recommendation ? REC_CONFIG[d.recommendation] : null
            const action = ACTION_CONFIG[d.final_action] ?? ACTION_CONFIG.pending
            const icon   = SPORT_ICONS[d.sport ?? ''] ?? '🏅'
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
                <span className="text-xl shrink-0 w-7 text-center">{icon}</span>

                {/* Event + market */}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-white truncate">{d.event_name}</div>
                  <div className="text-xs text-slate-500 mt-0.5 truncate">
                    {market}
                    {d.offered_odds ? ` · @${d.offered_odds}` : ''}
                  </div>
                </div>

                {/* AI recommendation */}
                {rec && (
                  <span className={`text-xs font-semibold shrink-0 hidden sm:block ${rec.color}`}>
                    {rec.label}
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
                  {action.label}
                </span>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
