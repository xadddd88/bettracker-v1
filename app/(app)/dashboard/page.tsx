import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import type { Bet } from '@/types'
import BankrollWidget from './BankrollWidget'
import { PageView } from '@/lib/analytics/PageView'
import { EVENTS } from '@/lib/analytics/events'
import OnboardingCard from '@/components/onboarding/OnboardingCard'
import NextBestAction, { type NextAction } from '@/components/dashboard/NextBestAction'
import EventPulseCard from '@/components/pulse/EventPulseCard'
import { getPrimaryEvent } from '@/lib/events/pulse'
import QuickSettle from '@/components/bets/QuickSettle'
import { calcSettlementMetrics, isSupportedSettlementStatus } from '@/lib/bets/settlement-metrics'
import { resolveBetStatus, type BetStatusKey } from '@/lib/bets/bet-status'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: betsData } = await supabase
    .from('bets')
    .select('*, legs:bet_legs(*)')
    .eq('user_id', user!.id)
    .is('archived_at', null)
    .order('placed_at', { ascending: false })

  const { data: bankroll } = await supabase
    .from('bankrolls')
    .select('balance, currency')
    .eq('user_id', user!.id)
    .eq('is_default', true)
    .single()

  const [{ count: watchlistCount }, { data: profile }] = await Promise.all([
    supabase
      .from('decisions')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user!.id)
      .eq('final_action', 'watchlisted'),
    supabase
      .from('profiles')
      .select('onboarding_completed')
      .eq('id', user!.id)
      .single(),
  ])

  const bets: Bet[] = betsData || []
  const today = new Date().toISOString().slice(0, 10)
  const primaryEvent = getPrimaryEvent(today)
  const metrics = calcSettlementMetrics(bets)
  const pendingBets = bets.filter(bet => bet.status === 'pending')
  const currency = bankroll?.currency || 'USD'
  const sym = currency === 'USD' ? '$' : currency === 'EUR' ? '€' : currency === 'UAH' ? '₴' : currency
  const recent = bets.slice(0, 5)

  const nextAction: NextAction = (() => {
    if (bets.length === 0) {
      return {
        type: 'first_analysis',
        icon: '01',
        label: 'Analyze your first match',
        detail: 'Begin with evidence, context and a structured decision.',
        href: '/ai',
      }
    }
    if ((watchlistCount ?? 0) > 0) {
      return {
        type: 'review_watchlist',
        icon: '02',
        label: `Review ${watchlistCount} watchlisted decision${watchlistCount === 1 ? '' : 's'}`,
        detail: 'Return to saved opportunities before the market moves.',
        href: '/decisions',
      }
    }
    if (pendingBets.length > 0) {
      return {
        type: 'settle_bets',
        icon: '03',
        label: `Settle ${pendingBets.length} pending bet${pendingBets.length === 1 ? '' : 's'}`,
        detail: 'Keep the portfolio record complete and trustworthy.',
        href: '/bets',
      }
    }
    return {
      type: 'scout',
      icon: '04',
      label: 'Scout for new value bets',
      detail: 'Build the next decision from current opportunities.',
      href: '/scout',
    }
  })()

  return (
    <div className="flex flex-col">
      <PageView event={EVENTS.DASHBOARD_VIEWED} props={{ bet_count: bets.length }} />
      {!profile?.onboarding_completed && <div className="mb-5"><OnboardingCard /></div>}

      <header className="flex min-h-12 items-center border-y border-black px-3 md:px-4">
        <div className="font-display text-lg font-black tracking-[-0.045em]">BETTRACKER</div>
        <div className="ml-4 flex-1 font-mono text-[8px] font-bold tracking-[0.18em] text-black/45">FOUNDER EDITION / WEB</div>
        <Link href="/settings" className="flex min-h-11 items-center text-[9px] font-black uppercase tracking-[0.12em] hover:underline">
          Account
        </Link>
      </header>

      <section className="editorial-dark relative min-h-[520px] overflow-hidden border-x border-black p-5 md:min-h-[620px] md:p-10">
        <div className="pointer-events-none absolute -right-4 top-12 select-none font-display text-[clamp(7rem,23vw,22rem)] font-black leading-none tracking-[-0.1em] text-white/[0.055]" aria-hidden>
          DECIDE
        </div>
        <div className="relative z-10 flex h-full min-h-[480px] flex-col md:min-h-[540px]">
          <div className="flex justify-between font-mono text-[9px] font-bold tracking-[0.18em] text-white">
            <span>SYSTEM 001</span>
            <span>LIVE PORTFOLIO</span>
          </div>
          <div className="my-auto py-12">
            <p className="mb-5 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[#e8ff00]">Decision intelligence</p>
            <h1 className="max-w-5xl font-display text-[clamp(3.4rem,8vw,8.6rem)] font-black uppercase leading-[0.78] tracking-[-0.075em] text-white">
              Betting<br />decisions<br />in focus
            </h1>
            <p className="mt-8 max-w-md text-sm leading-6 text-white/65 md:text-base">
              Capture the evidence. Review the context. Track the outcome.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:max-w-xl">
            <Link href="/ai" className="editorial-action border-white bg-white text-black">Scan now</Link>
            <Link href="/bets" className="editorial-action border-white text-white">Open tracker</Link>
          </div>
        </div>
      </section>

      <div className="editorial-ticker" aria-label="Analyze, verify, track">
        <div className="editorial-ticker-track">
          <div className="editorial-ticker-copy">Analyze / Verify / Track / Analyze / Verify / Track /</div>
          <div className="editorial-ticker-copy" aria-hidden>Analyze / Verify / Track / Analyze / Verify / Track /</div>
        </div>
      </div>

      <section className="border-x border-b border-black bg-[#f5f5f0] px-4 py-8 md:px-8 md:py-12">
        <SectionHeader index="01" label="Portfolio" detail={`${metrics.pendingCount} OPEN`} />
        <div className="mt-5">
          <BankrollWidget balance={bankroll?.balance || 0} sym={sym} />
        </div>
        <div className="mt-8 grid grid-cols-2 border-y border-black md:grid-cols-4">
          <Metric label="Net P&L" value={metrics.settledCount ? `${metrics.netProfit >= 0 ? '+' : ''}${sym}${metrics.netProfit.toFixed(2)}` : '—'} />
          <Metric label="Tracked" value={String(bets.length).padStart(2, '0')} />
          <Metric label="Settled" value={String(metrics.settledCount).padStart(2, '0')} />
          <Metric label="ROI" value={metrics.roi == null ? '—' : `${metrics.roi >= 0 ? '+' : ''}${metrics.roi.toFixed(1)}%`} />
        </div>
      </section>

      <section className="grid border-x border-b border-black sm:grid-cols-2">
        <Link href="/ai" className="group relative min-h-36 bg-white p-5 transition-colors hover:bg-[#e8ff00] sm:border-r sm:border-black">
          <span className="font-mono text-[9px] text-black/45">A</span>
          <span className="absolute right-5 top-4 text-2xl transition-transform group-hover:translate-x-1 group-hover:-translate-y-1">↗</span>
          <span className="absolute bottom-5 left-5 font-display text-xl font-black uppercase tracking-[-0.04em]">Scan coupon</span>
        </Link>
        <Link href="/bets/new" className="editorial-dark group relative min-h-36 bg-[#050505] p-5 text-white transition-colors hover:bg-[#e8ff00] hover:text-black">
          <span className="font-mono text-[9px] opacity-45">B</span>
          <span className="absolute right-5 top-4 text-2xl transition-transform group-hover:translate-x-1 group-hover:-translate-y-1">↗</span>
          <span className="absolute bottom-5 left-5 font-display text-xl font-black uppercase tracking-[-0.04em]">Add bet</span>
        </Link>
      </section>

      {(primaryEvent || nextAction) && (
        <section className="grid gap-px border-x border-b border-black bg-black p-px lg:grid-cols-2">
          {primaryEvent && <EventPulseCard event={primaryEvent} />}
          <NextBestAction action={nextAction} />
        </section>
      )}

      <section className="border-x border-b border-black bg-white px-4 py-8 md:px-8 md:py-12">
        <SectionHeader index="02" label="Recent bets" detail={`${recent.length} RECORDS`} />
        <div className="mt-4 border-t border-black">
          {recent.length === 0 ? (
            <div className="grid min-h-56 place-items-center py-12 text-center">
              <div>
                <p className="font-display text-4xl font-black uppercase tracking-[-0.06em]">No records</p>
                <p className="mt-3 text-sm text-black/55">Scan a coupon or prepare the first decision.</p>
                <Link href="/ai" className="btn-primary mt-6">Start with AI</Link>
              </div>
            </div>
          ) : recent.map((bet, index) => {
            const leg = bet.legs?.[0]
            const multiLeg = (bet.legs?.length || 0) > 1
            return (
              <div key={bet.id} className="border-b border-black">
                <Link href={`/bets/${bet.id}`} className="group grid min-h-24 grid-cols-[32px_1fr_auto] items-center gap-3 py-4 transition-colors hover:bg-[#e8ff00] md:grid-cols-[48px_minmax(0,1fr)_110px_110px] md:px-3">
                  <span className="font-mono text-[9px] text-black/45">{String(index + 1).padStart(2, '0')}</span>
                  <div className="min-w-0">
                    <div className="text-sm font-black uppercase tracking-[0.02em]">
                      {multiLeg ? `Express / ${bet.legs!.length} legs` : leg?.event_name || 'Untitled record'}
                    </div>
                    {multiLeg ? (
                      <ol className="mt-2 space-y-2" aria-label={`${bet.legs!.length} Express legs`}>
                        {bet.legs!.map((item, legIndex) => (
                          <li key={item.id} className="grid grid-cols-[24px_minmax(0,1fr)_auto] gap-2 text-xs">
                            <span className="font-mono text-[9px] text-black/40">{String(legIndex + 1).padStart(2, '0')}</span>
                            <span className="min-w-0">
                              <span className="block break-words font-semibold text-black/80">{item.event_name}</span>
                              <span className="mt-0.5 block break-words text-black/55">
                                {[item.market_type, item.selection].filter(Boolean).join(' · ') || '—'}
                              </span>
                            </span>
                            <span className="font-mono text-[10px] font-bold text-black/65">{Number(item.odds).toFixed(2)}</span>
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <div className="mt-1 break-words text-xs text-black/55">{leg?.market_type || '—'}</div>
                    )}
                  </div>
                  <div className="text-right font-mono text-xs md:text-left">
                    <div className="text-[8px] uppercase tracking-[0.14em] text-black/45">Stake</div>
                    <div className="mt-1">{sym}{bet.stake}</div>
                  </div>
                  <div className="hidden text-right md:block">
                    <StatusBadge status={bet.status} />
                    {isSupportedSettlementStatus(bet.status) && bet.pnl != null && (
                      <div className={`mt-1 font-mono text-xs ${bet.pnl >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                        {bet.pnl >= 0 ? '+' : ''}{sym}{bet.pnl.toFixed(2)}
                      </div>
                    )}
                  </div>
                </Link>
                {bet.status === 'pending' && <QuickSettle betId={bet.id} />}
              </div>
            )
          })}
        </div>
        <Link href="/bets" className="editorial-action mt-6">View complete archive →</Link>
      </section>
    </div>
  )
}

function SectionHeader({ detail, index, label }: { detail: string; index: string; label: string }) {
  return (
    <div className="grid grid-cols-[32px_1fr_auto] items-center gap-3">
      <span className="font-mono text-[9px] text-black/45">{index}</span>
      <h2 className="font-mono text-[10px] font-black uppercase tracking-[0.18em]">{label}</h2>
      <span className="font-mono text-[9px] font-bold">{detail}</span>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-h-24 border-r border-black p-4 last:border-r-0 even:border-r-0 md:even:border-r md:last:border-r-0">
      <div className="font-mono text-[8px] font-bold uppercase tracking-[0.16em] text-black/45">{label}</div>
      <div className="mt-3 font-display text-xl font-black tracking-[-0.04em] md:text-2xl">{value}</div>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<BetStatusKey, string> = {
    won: 'text-green-700',
    lost: 'text-red-700',
    pending: 'text-amber-700',
    void: 'text-black/45',
    push: 'text-blue-700',
    cashed_out: 'text-purple-700',
    partial: 'text-black/70',
    unknown: 'text-black/45',
  }
  const resolved = resolveBetStatus(status)
  return <span className={`font-mono text-[9px] font-black uppercase tracking-[0.12em] ${styles[resolved.key]}`}>{resolved.label}</span>
}
