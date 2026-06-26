import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import type { Bet, Stats } from '@/types'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Fetch bets with legs
  const { data: betsData } = await supabase
    .from('bets')
    .select('*, bet_legs(*)')
    .eq('user_id', user!.id)
    .order('placed_at', { ascending: false })

  // Fetch bankroll
  const { data: bankroll } = await supabase
    .from('bankrolls')
    .select('balance, currency')
    .eq('user_id', user!.id)
    .eq('is_default', true)
    .single()

  // Fetch pending decisions (watchlist)
  const { count: watchlistCount } = await supabase
    .from('decisions')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user!.id)
    .eq('final_action', 'watchlisted')

  const bets: Bet[] = betsData || []
  const settled = bets.filter(b => b.status !== 'pending')
  const won = settled.filter(b => b.status === 'won').length
  const totalStaked = settled.reduce((s, b) => s + b.stake, 0)
  const totalProfit = settled.reduce((s, b) => s + (b.pnl || 0), 0)
  const roi = totalStaked > 0 ? (totalProfit / totalStaked) * 100 : 0
  const winRate = settled.length > 0 ? (won / settled.length) * 100 : 0

  const currency = bankroll?.currency || 'USD'
  const sym = currency === 'USD' ? '$' : currency === 'EUR' ? '€' : currency

  const statCards = [
    { label: 'Balance', value: `${sym}${(bankroll?.balance || 0).toFixed(2)}`, color: '' },
    { label: 'Win Rate', value: `${winRate.toFixed(1)}%`, color: '' },
    { label: 'ROI', value: `${roi >= 0 ? '+' : ''}${roi.toFixed(1)}%`, color: roi >= 0 ? 'text-green-400' : 'text-red-400' },
    { label: 'Total P&L', value: `${totalProfit >= 0 ? '+' : ''}${sym}${totalProfit.toFixed(2)}`, color: totalProfit >= 0 ? 'text-green-400' : 'text-red-400' },
  ]

  const recent = bets.slice(0, 6)

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">{bets.length} bets tracked · {watchlistCount || 0} on watchlist</p>
        </div>
        <div className="flex gap-2">
          <Link href="/ai" className="btn-ghost text-sm">🤖 Analyze</Link>
          <Link href="/bets/new" className="btn-primary text-sm">+ Add Bet</Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {statCards.map(({ label, value, color }) => (
          <div key={label} className="stat-card">
            <div className="stat-label">{label}</div>
            <div className={`stat-value text-xl ${color || 'text-white'}`}>{value}</div>
          </div>
        ))}
      </div>

      {/* Recent bets */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-white">Recent Bets</h2>
          <Link href="/bets" className="text-xs text-indigo-400 hover:text-indigo-300">View all →</Link>
        </div>

        {recent.length === 0 ? (
          <div className="text-center py-10">
            <div className="text-3xl mb-2">🎯</div>
            <p className="text-gray-500 text-sm mb-4">No bets yet. Start by analyzing a match.</p>
            <div className="flex gap-3 justify-center">
              <Link href="/ai" className="btn-ghost text-sm">🤖 Analyze match</Link>
              <Link href="/bets/new" className="btn-primary text-sm">Quick add</Link>
            </div>
          </div>
        ) : (
          <div className="flex flex-col divide-y divide-gray-800">
            {recent.map((bet) => {
              const leg = bet.legs?.[0]
              const multiLeg = (bet.legs?.length || 0) > 1
              return (
                <div key={bet.id} className="flex items-center gap-3 py-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-white truncate">
                      {multiLeg ? `Express (${bet.legs!.length} events)` : leg?.event_name || '—'}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {multiLeg ? bet.legs!.map(l => l.selection || l.market_type).join(' · ') : (leg?.market_type || '—')}
                      {leg && !multiLeg && ` · @${leg.odds.toFixed(2)}`}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-xs text-gray-400">{sym}{bet.stake}</div>
                    <StatusBadge status={bet.status} />
                  </div>
                  {bet.pnl != null && (
                    <div className={`text-sm font-semibold w-16 text-right ${bet.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {bet.pnl >= 0 ? '+' : ''}{sym}{bet.pnl.toFixed(2)}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    won:    'text-green-400',
    lost:   'text-red-400',
    pending:'text-yellow-400',
    void:   'text-gray-500',
    push:   'text-blue-400',
  }
  return <span className={`text-xs capitalize ${styles[status] || 'text-gray-400'}`}>{status}</span>
}
