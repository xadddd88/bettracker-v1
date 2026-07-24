import Link from 'next/link'
import { notFound } from 'next/navigation'

import {
  BroadcastDataValue,
  BroadcastPanel,
  BroadcastStatus,
} from '@/components/ui/BroadcastNoir'
import { EVENTS } from '@/lib/analytics/events'
import { PageView } from '@/lib/analytics/PageView'
import { resolveBetStatus, type BetStatusKey } from '@/lib/bets/bet-status'
import { isSupportedSettlementStatus } from '@/lib/bets/settlement-metrics'
import { formatMoney } from '@/lib/money'
import { createClient } from '@/lib/supabase/server'
import type { BroadcastNoirStatus } from '@/lib/ui/broadcast-noir'
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
    .order('leg_index', { referencedTable: 'bet_legs', ascending: true })
    .single()

  if (!data) notFound()

  const bet = data as Bet
  const legs = bet.legs ?? []
  const isExpress = legs.length > 1
  const resolved = resolveBetStatus(bet.status)

  const { data: bankroll } = await supabase
    .from('bankrolls')
    .select('currency')
    .eq('user_id', user!.id)
    .eq('is_default', true)
    .single()

  const currency = bankroll?.currency || 'USD'
  const totalOdds = bet.total_odds ?? legs[0]?.odds

  return (
    <main className="bn-page mx-auto flex w-full max-w-4xl flex-col gap-4 pb-8">
      <PageView event={EVENTS.BET_DETAIL_VIEWED} props={{ sport: legs[0]?.sport, status: bet.status, is_parlay: isExpress }} />

      <Link className="bn-button bn-button-secondary w-fit" href="/bets">← Tracker</Link>

      <BroadcastPanel className="p-5 sm:p-7">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="editorial-kicker">Saved record · {isExpress ? `${legs.length}-leg Express` : 'Single'}</p>
            <h1 className="mt-3 break-words font-display text-[clamp(2rem,6vw,4.5rem)] font-black leading-[0.98] tracking-[-0.05em] text-bn-text">
              {isExpress ? 'Express coupon' : legs[0]?.event_name || 'Tracked bet'}
            </h1>
          </div>
          <BroadcastStatus className="shrink-0" status={statusTone(resolved.key)}>{resolved.label}</BroadcastStatus>
        </div>

        <dl className="mt-7 grid grid-cols-2 gap-px overflow-hidden rounded-control border border-bn-border-subtle bg-bn-border-subtle sm:grid-cols-4">
          <DataPoint label="Stake" value={formatMoney(bet.stake, currency)} />
          <DataPoint label="Total odds" value={totalOdds?.toFixed(2) ?? '—'} />
          <DataPoint
            label="P&L"
            value={isSupportedSettlementStatus(bet.status) && bet.pnl != null ? formatMoney(bet.pnl, currency, true) : '—'}
          />
          <DataPoint label="Bookmaker" value={bet.bookmaker || '—'} />
        </dl>
      </BroadcastPanel>

      <BroadcastPanel className="overflow-hidden p-0">
        <div className="flex min-h-14 items-center justify-between gap-4 border-b border-bn-border-strong px-5 py-3 sm:px-7">
          <h2 className="font-display text-xl font-black tracking-[-0.035em] text-bn-text">{isExpress ? 'Coupon legs' : 'Selection'}</h2>
          <span className="font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-bn-quiet">{legs.length} ordered</span>
        </div>

        {legs.length ? (
          <ol aria-label="Coupon legs" className="divide-y divide-bn-border-strong">
            {legs.map((leg, index) => (
              <li className="grid grid-cols-[2rem_minmax(0,1fr)_auto] gap-3 px-5 py-5 sm:px-7" key={leg.id}>
                <span className="font-mono text-[11px] font-bold tabular-nums text-bn-quiet">{String(index + 1).padStart(2, '0')}</span>
                <div className="min-w-0">
                  <div className="break-words text-sm font-bold leading-5 text-bn-text">{leg.event_name}</div>
                  <div className="mt-1 break-words text-xs leading-5 text-bn-muted">
                    {[leg.market_type, leg.selection].filter(Boolean).join(' · ') || 'Selection not recorded'}
                  </div>
                </div>
                <BroadcastDataValue className="text-sm font-black">{leg.odds?.toFixed(2) ?? '—'}</BroadcastDataValue>
              </li>
            ))}
          </ol>
        ) : (
          <p className="p-6 text-sm text-bn-muted">Leg details were not recorded.</p>
        )}
      </BroadcastPanel>

      <BroadcastPanel className="p-5 sm:p-7">
        <h2 className="font-display text-xl font-black tracking-[-0.035em] text-bn-text">Record details</h2>
        <dl className="mt-5 divide-y divide-bn-border-subtle">
          <DetailRow label="Placed" value={formatDateTime(bet.placed_at)} />
          {bet.settled_at ? <DetailRow label="Settled" value={formatDateTime(bet.settled_at)} /> : null}
          <DetailRow label="Source" value={bet.source || '—'} />
        </dl>
        {bet.notes ? (
          <div className="mt-5 border-t border-bn-border-strong pt-5">
            <div className="font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-bn-quiet">Notes</div>
            <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-bn-muted">{bet.notes}</p>
          </div>
        ) : null}
      </BroadcastPanel>

      <SettleActions
        betId={bet.id}
        status={bet.status}
        pnl={bet.pnl}
        settledAtLabel={bet.settled_at ? formatDateTime(bet.settled_at) : undefined}
        currency={currency}
      />
    </main>
  )
}

function DataPoint({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 bg-bn-field p-4">
      <dt className="font-mono text-[11px] font-bold uppercase tracking-[0.06em] text-bn-quiet">{label}</dt>
      <dd><BroadcastDataValue className="mt-2 block break-words text-sm font-black">{value}</BroadcastDataValue></dd>
    </div>
  )
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-4 py-3 text-sm">
      <dt className="text-bn-muted">{label}</dt>
      <dd className="break-words text-right font-semibold text-bn-text">{value}</dd>
    </div>
  )
}

function statusTone(status: BetStatusKey): BroadcastNoirStatus {
  if (status === 'won') return 'success'
  if (status === 'lost') return 'negative'
  if (status === 'pending' || status === 'partial') return 'review'
  return 'neutral'
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value))
}
