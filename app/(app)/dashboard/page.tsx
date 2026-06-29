import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import type { Bet } from '@/types'
import BankrollWidget from './BankrollWidget'
import { PageView } from '@/lib/analytics/PageView'
import { EVENTS } from '@/lib/analytics/events'
import OnboardingCard from '@/components/onboarding/OnboardingCard'
import NextBestAction, { type NextAction } from '@/components/dashboard/NextBestAction'

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

  const wonBets     = bets.filter(b => b.status === 'won')
  const lostBets    = bets.filter(b => b.status === 'lost')
  const pendingBets = bets.filter(b => b.status === 'pending')
  const settledBets = bets.filter(b => ['won', 'lost', 'void'].includes(b.status))

  const netProfit    = settledBets.reduce((s, b) => s + (b.pnl ?? 0), 0)
  const winLostCount = wonBets.length + lostBets.length
  const winRate      = winLostCount > 0 ? (wonBets.length / winLostCount) * 100 : 0
  const roiStake     = [...wonBets, ...lostBets].reduce((s, b) => s + b.stake, 0)
  const roi          = roiStake > 0 ? (netProfit / roiStake) * 100 : 0
  const pendingStake = pendingBets.reduce((s, b) => s + b.stake, 0)

  const currency = bankroll?.currency || 'USD'
  const sym = currency === 'USD' ? '$' : currency === 'EUR' ? '€' : currency === 'UAH' ? '₴' : currency

  const statCards = [
    {
      label: 'Win Rate',
      value: winLostCount > 0 ? `${winRate.toFixed(1)}%` : '—',
      color: '',
    },
    {
      label: 'ROI',
      value: roiStake > 0 ? `${roi >= 0 ? '+' : ''}${roi.toFixed(1)}%` : '—',
      color: roiStake > 0 ? (roi >= 0 ? 'text-green-400' : 'text-red-400') : '',
    },
    {
      label: 'Net Profit',
      value: settledBets.length > 0
        ? `${netProfit >= 0 ? '+' : ''}${sym}${netProfit.toFixed(2)}`
        : '—',
      color: settledBets.length > 0 ? (netProfit >= 0 ? 'text-green-400' : 'text-red-400') : '',
    },
    {
      label: 'Pending',
      value: `${sym}${pendingStake.toFixed(2)}`,
      color: '',
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
    <div className="flex flex-col gap-5">
      <PageView event={EVENTS.DASHBOARD_VIEWED} props={{ bet_count: bets.length }} />

      {/* First-run onboarding card */}
      {showOnboarding && <OnboardingCard />}

      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white font-display">Dashboard</h1>
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

      {/* Next best action */}
      <NextBestAction action={nextAction} />

      {/* Secondary stats */}
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
          <h2 className="font-semibold text-white font-display">Recent Bets</h2>
          <Link href="/bets" className="text-xs text-amber-400 hover:text-amber-300 transition-colors">
            View all →
          </Link>
        </div>

        {recent.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-slate-500 text-sm mb-4">No bets tracked yet. Start by analyzing a match.</p>
            <div className="flex gap-3 justify-center">
              <Link href="/ai" className="btn-ghost text-sm">Analyze match</Link>
              <Link href="/bets/new" className="btn-primary text-sm">Quick add</Link>
            </div>
          </div>
        ) : (
          <div className="flex flex-col divide-y divide-night-700/60">
            {recent.map((bet) => {
              const leg = bet.legs?.[0]
              const multiLeg = (bet.legs?.length || 0) > 1
              return (
                <Link
                  key={bet.id}
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
                  {bet.pnl != null && (
                    <div className={`text-sm font-semibold font-mono w-16 text-right ${bet.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {bet.pnl >= 0 ? '+' : ''}{sym}{bet.pnl.toFixed(2)}
                    </div>
                  )}
                </Link>
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
    won:     'text-green-400',
    lost:    'text-red-400',
    pending: 'text-violet-400',
    void:    'text-slate-500',
    push:    'text-blue-400',
  }
  return <span className={`text-xs capitalize ${styles[status] || 'text-slate-400'}`}>{status}</span>
}
