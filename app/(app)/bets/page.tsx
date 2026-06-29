import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import type { Bet } from '@/types'
import { PageView } from '@/lib/analytics/PageView'
import { EVENTS } from '@/lib/analytics/events'

const SPORT_ICON: Record<string, string> = {
  football:   '⚽',
  tennis:     '🎾',
  basketball: '🏀',
  hockey:     '🏒',
  other:      '🎯',
}

const STATUS_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  won:       { bg: 'bg-green-950 border border-green-900', text: 'text-green-400',  label: 'Won' },
  lost:      { bg: 'bg-red-950 border border-red-900',    text: 'text-red-400',    label: 'Lost' },
  pending:   { bg: 'bg-yellow-950 border border-yellow-900', text: 'text-yellow-400', label: 'Pending' },
  void:      { bg: 'bg-gray-800 border border-gray-700',  text: 'text-gray-400',  label: 'Void' },
  push:      { bg: 'bg-blue-950 border border-blue-900',  text: 'text-blue-400',  label: 'Push' },
  cashed_out:{ bg: 'bg-purple-950 border border-purple-900', text: 'text-purple-400', label: 'Cashed out' },
}

export default async function BetsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [{ data }, { data: bankroll }] = await Promise.all([
    supabase
      .from('bets')
      .select('*, legs:bet_legs(*)')
      .eq('user_id', user!.id)
      .order('placed_at', { ascending: false }),
    supabase
      .from('bankrolls')
      .select('currency')
      .eq('user_id', user!.id)
      .eq('is_default', true)
      .single(),
  ])

  const bets: Bet[] = data || []
  const currency = bankroll?.currency || 'USD'
  const sym = currency === 'USD' ? '$' : currency === 'EUR' ? '€' : currency === 'UAH' ? '₴' : currency

  const settled    = bets.filter(b => b.status !== 'pending')
  const won        = settled.filter(b => b.status === 'won').length
  const totalStaked  = bets.reduce((s, b) => s + b.stake, 0)
  const settledStaked = settled.reduce((s, b) => s + b.stake, 0)
  const totalProfit  = settled.reduce((s, b) => s + (b.pnl || 0), 0)
  const winRate    = settled.length > 0 ? (won / settled.length) * 100 : 0
  const roi        = settledStaked > 0 ? (totalProfit / settledStaked) * 100 : 0

  return (
    <div className="flex flex-col gap-6">
      <PageView event={EVENTS.BETS_LIST_VIEWED} props={{ bet_count: bets.length }} />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Bets</h1>
          <p className="text-sm text-gray-500 mt-1">{bets.length} bets · {settled.length} settled</p>
        </div>
        <Link href="/bets/new" className="btn-primary">+ Add Bet</Link>
      </div>

      {/* Summary strip */}
      {bets.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Total staked',  value: `${sym}${totalStaked.toFixed(0)}` },
            { label: 'Win rate',      value: settled.length ? `${winRate.toFixed(0)}%` : '—' },
            { label: 'ROI',           value: settled.length ? `${roi >= 0 ? '+' : ''}${roi.toFixed(1)}%` : '—', color: roi >= 0 ? 'text-green-400' : 'text-red-400' },
            { label: 'Total P&L',     value: settled.length ? `${totalProfit >= 0 ? '+' : ''}${sym}${totalProfit.toFixed(2)}` : '—', color: totalProfit >= 0 ? 'text-green-400' : 'text-red-400' },
          ].map(({ label, value, color }) => (
            <div key={label} className="stat-card">
              <div className="stat-label">{label}</div>
              <div className={`stat-value text-lg ${color || 'text-white'}`}>{value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Bet list */}
      {bets.length === 0 ? (
        <div className="card text-center py-14">
          <div className="text-4xl mb-3">🎯</div>
          <p className="text-gray-400 mb-4">No bets yet.</p>
          <Link href="/bets/new" className="btn-primary inline-flex">Add your first bet</Link>
        </div>
      ) : (
        <div className="card p-0 divide-y divide-gray-800">
          {bets.map((bet) => {
            const legs     = bet.legs ?? []
            const isParlay = legs.length > 1
            const leg      = legs[0]
            const sport    = leg?.sport || 'other'
            const status   = STATUS_STYLE[bet.status] ?? STATUS_STYLE.void

            const eventLabel = isParlay
              ? legs.map(l => l.event_name).join(' · ')
              : leg?.event_name || '—'

            const marketLabel = isParlay
              ? legs.map(l => [l.market_type, l.selection].filter(Boolean).join(' ')).join(' / ')
              : [leg?.market_type, leg?.selection].filter(Boolean).join(' · ') || '—'

            const date = new Date(bet.placed_at).toLocaleDateString('uk-UA', {
              day: '2-digit', month: '2-digit', year: 'numeric',
            })

            return (
              <Link key={bet.id} href={`/bets/${bet.id}`} className="flex items-center gap-4 px-4 py-4 hover:bg-gray-800/30 transition-colors">

                {/* Sport icon */}
                <div className="text-xl flex-shrink-0 w-7 text-center">
                  {SPORT_ICON[sport] || '🎯'}
                </div>

                {/* Event + market */}
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-white text-sm leading-snug line-clamp-1">
                    {eventLabel}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <span className="text-xs text-gray-400 line-clamp-1">{marketLabel}</span>
                    <span className="text-xs text-gray-600">·</span>
                    <span className="text-xs text-gray-600">{date}</span>
                  </div>
                </div>

                {/* Odds */}
                <div className="flex-shrink-0 text-right hidden sm:block">
                  <div className="text-xs text-gray-500 mb-0.5">Odds</div>
                  <div className="text-sm font-mono text-white">
                    {bet.total_odds?.toFixed(2) || '—'}
                  </div>
                </div>

                {/* Stake */}
                <div className="flex-shrink-0 text-right hidden sm:block">
                  <div className="text-xs text-gray-500 mb-0.5">Stake</div>
                  <div className="text-sm text-gray-200">{sym}{bet.stake}</div>
                </div>

                {/* Status */}
                <div className="flex-shrink-0">
                  <span className={`inline-block text-xs px-2.5 py-1 rounded-full font-medium ${status.bg} ${status.text}`}>
                    {status.label}
                  </span>
                </div>

                {/* P&L */}
                <div className="flex-shrink-0 w-20 text-right">
                  {bet.pnl == null ? (
                    <span className="text-gray-600 text-sm">—</span>
                  ) : (
                    <span className={`text-sm font-bold ${bet.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {bet.pnl >= 0 ? '+' : ''}{sym}{bet.pnl.toFixed(2)}
                    </span>
                  )}
                </div>

              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
