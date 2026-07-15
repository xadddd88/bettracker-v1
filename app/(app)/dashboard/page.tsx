import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
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

  const today        = new Date().toISOString().slice(0, 10)
  const primaryEvent = getPrimaryEvent(today)

  // Canonical settlement metrics (Decision #058) — same shared formulas as
  // the bets page, analytics, and coach.
  const m = calcSettlementMetrics(bets)
  const pendingBets = bets.filter(b => b.status === 'pending')

  const currency = bankroll?.currency || 'USD'
  const sym = currency === 'USD' ? '$' : currency === 'EUR' ? '€' : currency === 'UAH' ? '₴' : currency

  const statCards = [
    {
      label: 'Win Rate',
      value: m.winRate != null ? `${m.winRate.toFixed(1)}%` : '—',
      color: '',
      sub: 'Won / (won + lost)',
    },
    {
      label: 'ROI',
      value: m.roi != null ? `${m.roi >= 0 ? '+' : ''}${m.roi.toFixed(1)}%` : '—',
      color: m.roi != null ? (m.roi >= 0 ? 'text-green-400' : 'text-red-400') : '',
      sub: 'Return on won + lost stake',
    },
    {
      label: 'Net Profit',
      value: m.settledCount > 0
        ? `${m.netProfit >= 0 ? '+' : ''}${sym}${m.netProfit.toFixed(2)}`
        : '—',
      color: m.settledCount > 0 ? (m.netProfit >= 0 ? 'text-green-400' : 'text-red-400') : '',
      sub: 'Settled bets only',
    },
    {
      label: 'Pending',
      value: `${sym}${m.pendingStake.toFixed(2)}`,
      color: '',
      sub: `${m.pendingCount} open bet${m.pendingCount !== 1 ? 's' : ''}`,
    },
  ]

  const recent = bets.slice(0, 6)

  const nextAction: NextAction = (() => {
    if (bets.length === 0) {
      return {
        type:   'first_analysis',
        icon:   '🤖',
        label:  'Analyze your first match',
        detail: 'Get AI-powered edge, confidence, and risk scoring in seconds.',
        href:   '/ai',
      }
    }
    if ((watchlistCount ?? 0) > 0) {
      return {
        type:   'review_watchlist',
        icon:   '👁️',
        label:  `Review ${watchlistCount} watchlisted decision${watchlistCount === 1 ? '' : 's'}`,
        detail: 'Opportunities you saved are waiting for a decision.',
        href:   '/decisions',
      }
    }
    if (pendingBets.length > 0) {
      return {
        type:   'settle_bets',
        icon:   '🎯',
        label:  `Settle ${pendingBets.length} pending bet${pendingBets.length === 1 ? '' : 's'}`,
        detail: 'Record your results to keep analytics accurate.',
        href:   '/bets',
      }
    }
    return {
      type:   'scout',
      icon:   '🔍',
      label:  'Scout for new value bets',
      detail: 'AI-powered opportunity discovery across sports and leagues.',
      href:   '/scout',
    }
  })()

  const showOnboarding = !profile?.onboarding_completed

  return (
    <div className="flex flex-col gap-5 lg:gap-6">
      <PageView event={EVENTS.DASHBOARD_VIEWED} props={{ bet_count: bets.length }} />

      {/* First-run onboarding card */}
      {showOnboarding && <OnboardingCard />}

      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-white font-display">Dashboard</h1>
          <p className="text-xs text-slate-500 mt-1">
            {bets.length} bets tracked · {watchlistCount || 0} on watchlist
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Link href="/ai" className="btn-ghost text-sm">Analyze</Link>
          <Link href="/bets/new" className="btn-primary text-sm">+ Add Bet</Link>
        </div>
      </div>

      {/* Balance hero */}
      <BankrollWidget balance={bankroll?.balance || 0} sym={sym} />

      {/* Event Pulse + Next best action — paired side by side on desktop so the
          dashboard doesn't read as two full-width stretched mobile cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-5 items-stretch">
        {primaryEvent && <EventPulseCard event={primaryEvent} />}
        <div className={`grid ${!primaryEvent ? 'lg:col-span-2' : ''}`}>
          <NextBestAction action={nextAction} />
        </div>
      </div>

      {/* Secondary stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {statCards.map(({ label, value, color, sub }) => (
          <div key={label} className="stat-card">
            <div className="stat-label">{label}</div>
            <div className={`stat-value text-xl ${color || 'text-white'}`}>{value}</div>
            <div className="text-xs text-gray-600">{sub}</div>
          </div>
        ))}
      </div>

      {/* Recent bets */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-white font-display">Recent Bets</h2>
          <Link href="/bets" className="text-xs text-amber-400 hover:text-amber-300 transition-colors">
            View all →
          </Link>
        </div>

        {recent.length === 0 ? (
          <div className="text-center py-12">
            <p className="font-medium text-white mb-1">No bets yet</p>
            <p className="text-slate-500 text-sm mb-5">Run the AI Analyst to get a recommendation, then place your first bet.</p>
            <div className="flex gap-3 justify-center">
              <Link href="/ai" className="btn-ghost text-sm">Analyze match</Link>
              <Link href="/bets/new" className="btn-primary text-sm">+ Quick add</Link>
            </div>
          </div>
        ) : (
          <div className="flex flex-col divide-y divide-night-700/60">
            {recent.map((bet) => {
              const leg = bet.legs?.[0]
              const multiLeg = (bet.legs?.length || 0) > 1
              return (
                <div key={bet.id}>
                  <Link
                    href={`/bets/${bet.id}`}
                    className="flex items-center gap-3 py-3 hover:opacity-75 transition-opacity"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-white truncate">
                        {multiLeg ? `Express (${bet.legs!.length} events)` : leg?.event_name || '—'}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {multiLeg
                          ? bet.legs!.map(l => l.selection || l.market_type).join(' · ')
                          : (leg?.market_type || '—')}
                        {leg && !multiLeg && (
                          <span className="font-mono"> @{leg.odds.toFixed(2)}</span>
                        )}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-xs text-slate-400 font-mono">{sym}{bet.stake}</div>
                      <StatusBadge status={bet.status} />
                    </div>
                    {isSupportedSettlementStatus(bet.status) && bet.pnl != null && (
                      <div className={`text-sm font-semibold font-mono w-16 text-right ${bet.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {bet.pnl >= 0 ? '+' : ''}{sym}{bet.pnl.toFixed(2)}
                      </div>
                    )}
                  </Link>
                  {bet.status === 'pending' && <QuickSettle betId={bet.id} />}
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
  // Canonical resolver (Decision #058): explicit entry for every status key,
  // 'Unknown' label for unrecognized values — no raw text, no misleading
  // fallback.
  const styles: Record<BetStatusKey, string> = {
    won:        'text-green-400',
    lost:       'text-red-400',
    pending:    'text-violet-400',
    void:       'text-slate-500',
    push:       'text-blue-400',
    cashed_out: 'text-purple-400',
    partial:    'text-slate-300',
    unknown:    'text-slate-500',
  }
  const resolved = resolveBetStatus(status)
  return <span className={`text-xs ${styles[resolved.key]}`}>{resolved.label}</span>
}
