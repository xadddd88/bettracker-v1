import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Bet } from '@/types'
import SettleActions from './SettleActions'
import { PageView } from '@/lib/analytics/PageView'
import { EVENTS } from '@/lib/analytics/events'

export default async function BetDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data } = await supabase
    .from('bets')
    .select('*, legs:bet_legs(*)')
    .eq('id', id)
    .eq('user_id', user!.id)
    .single()

  if (!data) notFound()

  const bet = data as Bet
  const leg = bet.legs?.[0]
  const isParlay = (bet.legs?.length || 0) > 1

  // Resolve currency symbol from bankroll if available, else default
  const { data: bankroll } = await supabase
    .from('bankrolls')
    .select('currency')
    .eq('user_id', user!.id)
    .eq('is_default', true)
    .single()

  const currency = bankroll?.currency || 'USD'
  const sym = currency === 'USD' ? '$' : currency === 'EUR' ? '€' : currency === 'UAH' ? '₴' : currency

  const eventLabel = isParlay
    ? bet.legs!.map(l => l.event_name).join(' · ')
    : leg?.event_name || '—'

  return (
    <div className="max-w-xl flex flex-col gap-6">
      <PageView event={EVENTS.BET_DETAIL_VIEWED} props={{ sport: leg?.sport, status: bet.status, is_parlay: isParlay }} />
      <div className="flex items-center gap-2">
        <Link href="/bets" className="text-gray-500 hover:text-gray-300 text-sm transition-colors">
          ← Bets
        </Link>
      </div>

      <div className="card flex flex-col gap-5">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-lg font-bold text-white leading-snug">{eventLabel}</h1>
          <StatusBadge status={bet.status} />
        </div>

        <div className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm">
          {leg?.market_type && <Row label="Market"    value={leg.market_type} />}
          {leg?.selection   && <Row label="Selection" value={leg.selection} />}
          {bet.total_odds != null && (
            <Row label="Odds" value={bet.total_odds.toFixed(2)} />
          )}
          <Row label="Stake" value={`${sym}${bet.stake.toFixed(2)}`} />
          {bet.bookmaker && <Row label="Bookmaker" value={bet.bookmaker} />}
          {bet.pnl != null && (
            <Row
              label="P&L"
              value={`${bet.pnl >= 0 ? '+' : ''}${sym}${bet.pnl.toFixed(2)}`}
              color={bet.pnl >= 0 ? 'text-green-400' : 'text-red-400'}
            />
          )}
          <Row
            label="Placed"
            value={new Date(bet.placed_at).toLocaleDateString('en-GB', {
              day: '2-digit', month: 'short', year: 'numeric',
            })}
          />
          {bet.settled_at && (
            <Row
              label="Settled"
              value={new Date(bet.settled_at).toLocaleDateString('en-GB', {
                day: '2-digit', month: 'short', year: 'numeric',
              })}
            />
          )}
        </div>

        {isParlay && (
          <div className="border-t border-gray-800 pt-4">
            <div className="text-xs text-gray-500 mb-2">Legs</div>
            <div className="flex flex-col gap-2">
              {bet.legs!.map((l, i) => (
                <div key={l.id} className="flex items-center gap-2 text-sm">
                  <span className="text-gray-600 text-xs w-4">{i + 1}.</span>
                  <span className="text-white flex-1">{l.event_name}</span>
                  <span className="text-gray-400">{l.market_type}</span>
                  <span className="text-gray-500 font-mono">@{l.odds.toFixed(2)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {bet.notes && (
          <div className="border-t border-gray-800 pt-4 text-sm text-gray-400">
            {bet.notes}
          </div>
        )}
      </div>

      <SettleActions
        betId={bet.id}
        status={bet.status}
        pnl={bet.pnl}
        settledAt={bet.settled_at}
        sym={sym}
      />
    </div>
  )
}

function Row({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`font-medium text-white mt-0.5 ${color ?? ''}`}>{value}</div>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    won:     'text-green-400 bg-green-950 border border-green-900',
    lost:    'text-red-400 bg-red-950 border border-red-900',
    pending: 'text-yellow-400 bg-yellow-950 border border-yellow-900',
    void:    'text-gray-400 bg-gray-800 border border-gray-700',
    push:    'text-blue-400 bg-blue-950 border border-blue-900',
  }
  return (
    <span className={`text-xs px-2.5 py-1 rounded-full font-medium capitalize flex-shrink-0 ${styles[status] ?? 'text-gray-400 bg-gray-800 border border-gray-700'}`}>
      {status}
    </span>
  )
}
