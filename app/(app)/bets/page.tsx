import Link from 'next/link'
import { ArrowRight, Plus, ScanLine } from 'lucide-react'

import { PageView } from '@/lib/analytics/PageView'
import { EVENTS } from '@/lib/analytics/events'
import { resolveBetStatus, type BetStatusKey } from '@/lib/bets/bet-status'
import { calcSettlementMetrics, isSupportedSettlementStatus } from '@/lib/bets/settlement-metrics'
import { createClient } from '@/lib/supabase/server'
import { BroadcastStatus } from '@/components/ui/BroadcastNoir'
import QuickSettle from '@/components/bets/QuickSettle'
import type { Bet } from '@/types'

const SPORT_ICON: Record<string, string> = {
  football: '⚽',
  soccer: '⚽',
  tennis: '🎾',
  basketball: '🏀',
  hockey: '🏒',
  ice_hockey: '🏒',
  other: '◎',
}

export default async function BetsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [{ data }, { data: bankroll }] = await Promise.all([
    supabase
      .from('bets')
      .select('*, legs:bet_legs(*)')
      .eq('user_id', user!.id)
      .is('archived_at', null)
      .order('placed_at', { ascending: false })
      // Express legs display in coupon order (Decision #060 Phase B);
      // legacy legs have NULL leg_index and keep their old position.
      .order('leg_index', { referencedTable: 'bet_legs', ascending: true }),
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

  // Canonical settlement metrics (Decision #058): settled = won+lost+void,
  // void excluded from Win Rate and ROI, unsupported/unknown statuses
  // excluded from every financial metric.
  const m = calcSettlementMetrics(bets)
  const totalStaked = bets.reduce((sum, bet) => sum + bet.stake, 0)

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-7">
      <PageView event={EVENTS.BETS_LIST_VIEWED} props={{ bet_count: bets.length }} />

      <header className="grid gap-6 border-y border-[var(--border-strong)] py-6 sm:grid-cols-[1fr_auto] sm:items-end">
        <div>
          <p className="font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--text-quiet)]">Tracker / Operational archive</p>
          <h1 className="mt-3 font-display text-5xl font-black uppercase leading-none tracking-[0] text-[var(--text-primary)] sm:text-7xl">Tracker</h1>
          <p className="mt-4 max-w-xl text-sm text-[var(--text-muted)]">
            {bets.length} records / {m.settledCount} settled / newest first
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Link href="/ai" className="btn-ghost w-full sm:w-auto"><ScanLine aria-hidden="true" className="h-4 w-4" /> Scan coupon</Link>
          <Link href="/bets/new" className="btn-primary w-full sm:w-auto"><Plus aria-hidden="true" className="h-4 w-4" /> Add bet</Link>
        </div>
      </header>

      {bets.length > 0 ? (
        <section aria-label="Tracker summary" className="grid grid-cols-2 border border-[var(--border-strong)] md:grid-cols-4">
          <Metric label="Total staked" value={`${sym}${totalStaked.toFixed(0)}`} />
          <Metric label="Win rate" value={m.winRate != null ? `${m.winRate.toFixed(0)}%` : '—'} />
          <Metric label="ROI" tone={m.roi == null ? 'neutral' : m.roi < 0 ? 'negative' : 'success'} value={m.roi != null ? `${m.roi >= 0 ? '+' : ''}${m.roi.toFixed(1)}%` : '—'} />
          <Metric label="Total P&L" tone={m.settledCount === 0 ? 'neutral' : m.netProfit < 0 ? 'negative' : 'success'} value={m.settledCount ? `${m.netProfit >= 0 ? '+' : ''}${sym}${m.netProfit.toFixed(2)}` : '—'} />
        </section>
      ) : null}

      {bets.length > 0 ? (
        <section aria-label="Status guide" className="flex flex-wrap gap-2">
          <BroadcastStatus status="review">Pending / awaiting result</BroadcastStatus>
          <BroadcastStatus status="success">Won / confirmed win</BroadcastStatus>
          <BroadcastStatus status="negative">Lost / confirmed loss</BroadcastStatus>
          <BroadcastStatus status="neutral">Void / stake returned</BroadcastStatus>
          <BroadcastStatus status="neutral">Other / review record</BroadcastStatus>
        </section>
      ) : null}

      {bets.length === 0 ? (
        <section className="border-y border-[var(--border-strong)] py-16">
          <p className="font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--text-quiet)]">Archive empty</p>
          <h2 className="mt-3 font-display text-4xl font-black uppercase tracking-[0] text-[var(--text-primary)]">No tracked records</h2>
          <p className="mt-4 max-w-xl text-sm leading-6 text-[var(--text-muted)]">Scan a coupon into an editable draft or enter a bet manually. Nothing is saved until you confirm it.</p>
          <div className="mt-7 flex flex-col gap-2 sm:flex-row">
            <Link href="/ai" className="btn-ghost w-full sm:w-auto"><ScanLine aria-hidden="true" className="h-4 w-4" /> Scan coupon</Link>
            <Link href="/bets/new" className="btn-primary w-full sm:w-auto"><Plus aria-hidden="true" className="h-4 w-4" /> Add bet</Link>
          </div>
        </section>
      ) : (
        <section aria-label="Tracked bets" className="border-t border-[var(--border-strong)]">
          {bets.map((bet) => {
            const legs = bet.legs ?? []
            const isParlay = legs.length > 1
            const lead = legs[0]
            const sport = lead?.sport || 'other'
            const resolved = resolveBetStatus(bet.status)
            const date = new Date(bet.placed_at).toLocaleDateString('uk-UA', {
              day: '2-digit', month: '2-digit', year: 'numeric',
            })

            return (
              <article key={bet.id} className="border-b border-[var(--border-subtle)]">
                <Link href={`/bets/${bet.id}`} className="grid grid-cols-[28px_minmax(0,1fr)] gap-x-3 gap-y-4 px-1 py-5 transition-colors hover:bg-[var(--field)] sm:grid-cols-[32px_minmax(0,1fr)_auto] sm:px-4">
                  <span aria-hidden="true" className="pt-1 text-center text-xl">{SPORT_ICON[sport] || '◎'}</span>

                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-[11px] font-black uppercase tracking-[0.1em] text-[var(--text-muted)]">{isParlay ? `Express / ${legs.length} legs` : 'Single'}</span>
                      <span className="font-mono text-[11px] text-[var(--text-quiet)]">{date}</span>
                    </div>

                    {isParlay ? (
                      <ol className="mt-3 space-y-3" aria-label={`${legs.length} Express legs`}>
                        {legs.map((item, legIndex) => (
                          <li key={item.id} className="grid grid-cols-[24px_minmax(0,1fr)_auto] gap-2 text-sm">
                            <span className="font-mono text-[11px] text-[var(--text-quiet)]">{String(legIndex + 1).padStart(2, '0')}</span>
                            <span className="min-w-0">
                              <span className="block break-words font-semibold text-[var(--text-primary)]">{item.event_name || 'Event not recorded'}</span>
                              <span className="mt-1 block break-words text-xs text-[var(--text-muted)]">{[item.market_type, item.selection].filter(Boolean).join(' · ') || 'Selection not recorded'}</span>
                            </span>
                            <span className="bn-data-value font-mono text-xs font-bold">{Number(item.odds).toFixed(2)}</span>
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <div className="mt-3">
                        <p className="break-words text-sm font-semibold text-[var(--text-primary)]">{lead?.event_name || 'Event not recorded'}</p>
                        <p className="mt-1 break-words text-xs text-[var(--text-muted)]">{[lead?.market_type, lead?.selection].filter(Boolean).join(' · ') || 'Selection not recorded'}</p>
                      </div>
                    )}
                  </div>

                  <div className="col-start-2 flex min-w-0 flex-wrap items-end gap-x-4 gap-y-3 sm:col-start-3 sm:row-start-1 sm:justify-end">
                    <RecordValue label="Total odds" value={bet.total_odds?.toFixed(2) || '—'} />
                    <RecordValue label="Stake" value={`${sym}${bet.stake}`} />
                    <BroadcastStatus status={statusTone(resolved.key)}>{resolved.label}</BroadcastStatus>
                    <RecordValue
                      label="P&L"
                      tone={bet.pnl == null || !isSupportedSettlementStatus(bet.status) ? 'neutral' : bet.pnl < 0 ? 'negative' : 'success'}
                      value={bet.pnl == null || !isSupportedSettlementStatus(bet.status) ? '—' : `${bet.pnl >= 0 ? '+' : ''}${sym}${bet.pnl.toFixed(2)}`}
                    />
                    <ArrowRight aria-hidden="true" className="mb-1 h-5 w-5 text-[var(--signal)]" />
                  </div>
                </Link>
                {bet.status === 'pending' ? <QuickSettle betId={bet.id} /> : null}
              </article>
            )
          })}
        </section>
      )}
    </div>
  )
}

function Metric({ label, tone = 'neutral', value }: { label: string; tone?: 'negative' | 'neutral' | 'success'; value: string }) {
  return (
    <div className="min-h-24 border-b border-r border-[var(--border-subtle)] p-4">
      <p className="font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-quiet)]">{label}</p>
      <p className={`mt-3 font-mono text-xl font-black tabular-nums ${tone === 'success' ? 'text-[var(--success)]' : tone === 'negative' ? 'text-[var(--negative)]' : 'text-[var(--data-value)]'}`}>{value}</p>
    </div>
  )
}

function RecordValue({ label, tone = 'neutral', value }: { label: string; tone?: 'negative' | 'neutral' | 'success'; value: string }) {
  return (
    <span className="min-w-14">
      <span className="block font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--text-quiet)]">{label}</span>
      <span className={`mt-1 block font-mono text-xs font-bold tabular-nums ${tone === 'success' ? 'text-[var(--success)]' : tone === 'negative' ? 'text-[var(--negative)]' : 'text-[var(--data-value)]'}`}>{value}</span>
    </span>
  )
}

function statusTone(status: BetStatusKey): 'negative' | 'neutral' | 'review' | 'success' {
  if (status === 'won') return 'success'
  if (status === 'lost') return 'negative'
  if (status === 'pending') return 'review'
  return 'neutral'
}
