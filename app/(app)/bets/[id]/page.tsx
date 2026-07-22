import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { notFound } from 'next/navigation'

import { PageView } from '@/lib/analytics/PageView'
import { EVENTS } from '@/lib/analytics/events'
import { resolveBetStatus, type BetStatusKey } from '@/lib/bets/bet-status'
import { isSupportedSettlementStatus } from '@/lib/bets/settlement-metrics'
import { createClient } from '@/lib/supabase/server'
import { BroadcastDataValue, BroadcastStatus } from '@/components/ui/BroadcastNoir'
import type { Bet } from '@/types'
import SettleActions from './SettleActions'

export default async function BetDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data } = await supabase
    .from('bets')
    .select('*, legs:bet_legs(*)')
    .eq('id', id)
    .eq('user_id', user!.id)
    .is('archived_at', null)
    // Express legs display in coupon order (Decision #060 Phase B).
    .order('leg_index', { referencedTable: 'bet_legs', ascending: true })
    .single()

  if (!data) notFound()

  const bet = data as Bet
  const leg = bet.legs?.[0]
  const isParlay = (bet.legs?.length || 0) > 1

  const { data: bankroll } = await supabase
    .from('bankrolls')
    .select('currency')
    .eq('user_id', user!.id)
    .eq('is_default', true)
    .single()

  const currency = bankroll?.currency || 'USD'
  const sym = currency === 'USD' ? '$' : currency === 'EUR' ? '€' : currency === 'UAH' ? '₴' : currency
  const resolved = resolveBetStatus(bet.status)
  const title = isParlay ? `Express / ${bet.legs!.length} legs` : leg?.event_name || 'Tracked bet'

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <PageView event={EVENTS.BET_DETAIL_VIEWED} props={{ sport: leg?.sport, status: bet.status, is_parlay: isParlay }} />

      <Link href="/bets" className="btn-ghost w-full sm:w-fit"><ArrowLeft aria-hidden="true" className="h-4 w-4" /> Back to Tracker</Link>

      <header className="border-y border-[var(--border-strong)] py-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--text-quiet)]">Tracked record / {isParlay ? 'Express' : 'Single'}</p>
            <h1 className="mt-3 break-words font-display text-4xl font-black uppercase leading-none tracking-[0] text-[var(--text-primary)] sm:text-6xl">{title}</h1>
          </div>
          <BroadcastStatus status={statusTone(resolved.key)}>{resolved.label}</BroadcastStatus>
        </div>
      </header>

      <section aria-label="Bet summary" className="grid grid-cols-2 border border-[var(--border-strong)] sm:grid-cols-3">
        {!isParlay && leg?.market_type ? <SummaryMetric label="Market" value={leg.market_type} /> : null}
        {!isParlay && leg?.selection ? <SummaryMetric label="Selection" value={leg.selection} /> : null}
        {bet.total_odds != null ? <SummaryMetric data label={isParlay ? 'Total odds' : 'Odds'} value={bet.total_odds.toFixed(2)} /> : null}
        <SummaryMetric data label="Stake" value={`${sym}${bet.stake.toFixed(2)}`} />
        {bet.bookmaker ? <SummaryMetric label="Bookmaker" value={bet.bookmaker} /> : null}
        {isSupportedSettlementStatus(bet.status) && bet.pnl != null ? (
          <SummaryMetric label="P&L" tone={bet.pnl < 0 ? 'negative' : 'success'} value={`${bet.pnl >= 0 ? '+' : ''}${sym}${bet.pnl.toFixed(2)}`} />
        ) : null}
        <SummaryMetric label="Placed" value={new Date(bet.placed_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} />
        {bet.settled_at ? <SummaryMetric label="Settled" value={new Date(bet.settled_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} /> : null}
      </section>

      {isParlay ? (
        <section aria-labelledby="express-legs-title" className="border-y border-[var(--border-strong)]">
          <div className="flex min-h-14 items-center justify-between border-b border-[var(--border-strong)] py-3">
            <h2 id="express-legs-title" className="font-mono text-[11px] font-black uppercase tracking-[0.12em] text-[var(--text-muted)]">Ordered coupon legs</h2>
            <span className="font-mono text-xs font-bold text-[var(--data-value)]">{bet.legs!.length}</span>
          </div>
          <ol>
            {bet.legs!.map((l, i) => (
              <li key={l.id} className="grid grid-cols-[28px_minmax(0,1fr)_auto] gap-3 border-b border-[var(--border-subtle)] py-4 text-sm last:border-b-0">
                <span className="font-mono text-[11px] text-[var(--text-quiet)]">{String(i + 1).padStart(2, '0')}</span>
                <span className="min-w-0">
                  <span className="block break-words font-semibold text-[var(--text-primary)]">{l.event_name || 'Event not recorded'}</span>
                  {l.selection ? <span className="mt-1 block break-words text-xs text-[var(--text-muted)]">Selection: {l.selection}</span> : null}
                  {l.market_type ? <span className="mt-1 block break-words text-xs text-[var(--text-quiet)]">Market: {l.market_type}</span> : null}
                </span>
                <BroadcastDataValue className="font-mono text-sm font-bold">{Number(l.odds).toFixed(2)}</BroadcastDataValue>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {bet.notes ? (
        <section className="border-y border-[var(--border-strong)] py-5">
          <h2 className="font-mono text-[11px] font-black uppercase tracking-[0.12em] text-[var(--text-quiet)]">Notes</h2>
          <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-[var(--text-muted)]">{bet.notes}</p>
        </section>
      ) : null}

      <SettleActions betId={bet.id} status={bet.status} pnl={bet.pnl} settledAt={bet.settled_at} sym={sym} />
    </div>
  )
}

function SummaryMetric({ data = false, label, tone = 'neutral', value }: { data?: boolean; label: string; tone?: 'negative' | 'neutral' | 'success'; value: string }) {
  return (
    <div className="min-h-24 min-w-0 border-b border-r border-[var(--border-subtle)] p-4">
      <p className="font-mono text-[11px] font-bold uppercase tracking-[0.07em] text-[var(--text-quiet)]">{label}</p>
      <p className={`mt-3 break-words text-sm font-semibold ${tone === 'success' ? 'text-[var(--success)]' : tone === 'negative' ? 'text-[var(--negative)]' : data ? 'font-mono tabular-nums text-[var(--data-value)]' : 'text-[var(--text-primary)]'}`}>{value}</p>
    </div>
  )
}

function statusTone(status: BetStatusKey): 'negative' | 'neutral' | 'review' | 'success' {
  if (status === 'won') return 'success'
  if (status === 'lost') return 'negative'
  if (status === 'pending') return 'review'
  return 'neutral'
}
