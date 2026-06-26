import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import type { Bet } from '@/types'

const STATUS_STYLE: Record<string, string> = {
  won:     'bg-green-950 text-green-400 border-green-900',
  lost:    'bg-red-950 text-red-400 border-red-900',
  pending: 'bg-yellow-950 text-yellow-400 border-yellow-900',
  void:    'bg-gray-800 text-gray-400 border-gray-700',
  push:    'bg-blue-950 text-blue-400 border-blue-900',
}

export default async function BetsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data } = await supabase
    .from('bets')
    .select('*, bet_legs(*)')
    .eq('user_id', user!.id)
    .order('placed_at', { ascending: false })

  const bets: Bet[] = data || []

  const settled = bets.filter(b => b.status !== 'pending')
  const totalStaked = settled.reduce((s, b) => s + b.stake, 0)
  const totalProfit = settled.reduce((s, b) => s + (b.pnl || 0), 0)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Bets</h1>
          <p className="text-sm text-gray-500 mt-1">
            {bets.length} total · Staked ${totalStaked.toFixed(0)} · P&L{' '}
            <span className={totalProfit >= 0 ? 'text-green-400' : 'text-red-400'}>
              {totalProfit >= 0 ? '+' : ''}${totalProfit.toFixed(2)}
            </span>
          </p>
        </div>
        <Link href="/bets/new" className="btn-primary">+ Add Bet</Link>
      </div>

      {bets.length === 0 ? (
        <div className="card text-center py-14">
          <div className="text-4xl mb-3">🎯</div>
          <p className="text-gray-400 mb-4">No bets yet.</p>
          <Link href="/bets/new" className="btn-primary inline-flex">Add your first bet</Link>
        </div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 bg-gray-900/60">
                {['Event', 'Market', 'Odds', 'Stake', 'Status', 'P&L'].map(h => (
                  <th key={h} className="text-left text-xs font-medium text-gray-500 px-4 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {bets.map((bet) => {
                const leg = bet.legs?.[0]
                const isParlay = (bet.legs?.length || 0) > 1
                return (
                  <tr key={bet.id} className="hover:bg-gray-800/40 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-medium text-white truncate max-w-[200px]">
                        {isParlay ? `Express ×${bet.legs!.length}` : leg?.event_name || '—'}
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {new Date(bet.placed_at).toLocaleDateString()}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-400 max-w-[120px] truncate">
                      {isParlay
                        ? bet.legs!.map(l => l.market_type).join(' / ')
                        : leg?.market_type || '—'}
                    </td>
                    <td className="px-4 py-3 text-white font-mono">
                      {bet.total_odds?.toFixed(2) || '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-300">${bet.stake}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block text-xs px-2 py-0.5 rounded-full border capitalize ${STATUS_STYLE[bet.status] || ''}`}>
                        {bet.status}
                      </span>
                    </td>
                    <td className={`px-4 py-3 font-semibold ${bet.pnl == null ? 'text-gray-600' : bet.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {bet.pnl == null ? '—' : `${bet.pnl >= 0 ? '+' : ''}$${bet.pnl.toFixed(2)}`}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
