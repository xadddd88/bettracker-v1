import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import type { Bet } from '@/types'
import { PageView } from '@/lib/analytics/PageView'
import { EVENTS } from '@/lib/analytics/events'
import OnboardingCard from '@/components/onboarding/OnboardingCard'
import { PulseProvider } from '@/components/pulse/PulseProvider'
import { getPrimaryEvent, getActiveEvents } from '@/lib/events/pulse'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [
    { data: betsData },
    { data: bankroll },
    { count: watchlistCount },
    { data: profile },
    { data: opportunities },
  ] = await Promise.all([
    supabase.from('bets').select('*, legs:bet_legs(*)').eq('user_id', user!.id).order('placed_at', { ascending: false }),
    supabase.from('bankrolls').select('balance, currency').eq('user_id', user!.id).eq('is_default', true).single(),
    supabase.from('decisions').select('*', { count: 'exact', head: true }).eq('user_id', user!.id).eq('final_action', 'watchlisted'),
    supabase.from('profiles').select('onboarding_completed').eq('id', user!.id).single(),
    supabase.from('market_opportunities').select('*').eq('user_id', user!.id).eq('status', 'pending').order('scout_score', { ascending: false }).limit(3),
  ])

  const bets: Bet[] = betsData || []
  const today        = new Date().toISOString().slice(0, 10)
  const primaryEvent = getPrimaryEvent(today)
  const activeEvents = getActiveEvents(today)

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

  const showOnboarding = !profile?.onboarding_completed
  const recent = bets.slice(0, 5)
  const heroTitle = primaryEvent ? (EVENT_HEADLINE[primaryEvent.theme] ?? 'Bet smarter.') : 'Bet smarter.\nTrack everything.'
  const heroSub   = primaryEvent ? `${primaryEvent.label} is live. Scout AI is tracking every fixture.` : 'AI analysis, bankroll tracking, and market scouting in one place.'
  const secondary = activeEvents.filter(e => e.id !== primaryEvent?.id)

  return (
    <>
      <PageView event={EVENTS.DASHBOARD_VIEWED} props={{ bet_count: bets.length }} />
      <PulseProvider event={primaryEvent} />

      {showOnboarding && (
        <div className="px-4 pt-4 md:px-6"><OnboardingCard /></div>
      )}

      {/* HERO */}
      <section className="relative overflow-hidden flex flex-col justify-end px-4 md:px-6 pt-14 pb-10"
        style={{ background: 'var(--pulse-gradient), var(--bg-base)' }}>
        {primaryEvent && (
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest mb-4"
            style={{ color: 'var(--pulse-text)' }}>
            <span className="w-1.5 h-1.5 rounded-full animate-live-dot" style={{ background: 'var(--pulse-text)' }} />
            {primaryEvent.icon} {primaryEvent.label} · Live now
          </div>
        )}
        <h1 className="text-4xl md:text-5xl font-bold text-white leading-[1.06] mb-3 whitespace-pre-line"
          style={{ letterSpacing: '-0.03em' }}>
          {heroTitle}
        </h1>
        <p className="text-sm md:text-base text-slate-400 max-w-md mb-7 leading-relaxed">{heroSub}</p>
        <div className="flex items-center gap-3 flex-wrap">
          <Link href="/scout" className="btn-primary text-sm">{primaryEvent ? `Scout ${primaryEvent.icon}` : 'Open Scout'}</Link>
          <Link href="/ai" className="btn-ghost text-sm">Analyze match</Link>
          {secondary.length > 0 && (
            <span className="text-xs text-slate-500">
              Also live: {secondary.slice(0, 2).map(e => e.shortName ?? e.label.split(' ')[0]).join(', ')}
            </span>
          )}
        </div>
      </section>

      {/* CONTROL PANEL */}
      <div className="px-4 md:px-6 pb-10 flex flex-col gap-4 mt-5">

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="stat-card">
            <div className="stat-label">Bankroll</div>
            <div className="stat-value">{sym}{(bankroll?.balance ?? 0).toFixed(0)}</div>
            <div className="stat-delta" style={{ color: 'var(--win)' }}>
              {pendingBets.length > 0 ? `${sym}${pendingStake.toFixed(0)} at stake` : 'No open stake'}
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Win rate</div>
            <div className="stat-value" style={{ color: winLostCount > 0 && winRate >= 50 ? 'var(--win)' : 'var(--text-primary)' }}>
              {winLostCount > 0 ? `${winRate.toFixed(1)}%` : '—'}
            </div>
            <div className="stat-delta">{winLostCount} settled</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Net P&amp;L</div>
            <div className="stat-value" style={{ color: settledBets.length > 0 ? (netProfit >= 0 ? 'var(--win)' : 'var(--loss)') : 'var(--text-primary)' }}>
              {settledBets.length > 0 ? `${netProfit >= 0 ? '+' : ''}${sym}${netProfit.toFixed(0)}` : '—'}
            </div>
            <div className="stat-delta">{roiStake > 0 ? `${roi >= 0 ? '+' : ''}${roi.toFixed(1)}% ROI` : ''}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Open bets</div>
            <div className="stat-value">{pendingBets.length}</div>
            <div className="stat-delta">{pendingBets.length > 0 ? `${sym}${pendingStake.toFixed(0)} committed` : 'None pending'}</div>
          </div>
        </div>

        {/* Opportunities + Bets grid */}
        <div className="grid md:grid-cols-2 gap-4">
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-semibold text-white">Scout opportunities</span>
              <Link href="/scout" className="text-xs transition-colors hover:opacity-70" style={{ color: 'var(--pulse-text)' }}>Run Scout</Link>
            </div>
            {!opportunities || opportunities.length === 0 ? (
              <div className="flex flex-col items-center py-8 gap-3">
                <p className="text-sm text-slate-500">No opportunities scouted yet.</p>
                <Link href="/scout" className="btn-ghost text-xs">Open Scout</Link>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {(opportunities as any[]).map((opp) => (
                  <div key={opp.id} className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold shrink-0"
                      style={{ background: 'var(--pulse-secondary)', color: 'var(--pulse-text)' }}>
                      {opp.scout_score}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-white truncate">{opp.event_name}</div>
                      <div className="text-xs text-slate-500 truncate">{opp.market_type}{opp.selection ? ` · ${opp.selection}` : ''}</div>
                      {opp.match_date && (
                        <div className="text-xs mt-0.5" style={{ color: 'var(--text-faint)' }}>
                          {primaryEvent?.icon ?? ''} {fmtDate(opp.match_date)}
                        </div>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      {opp.offered_odds != null && (
                        <div className="text-sm font-semibold text-white font-mono">{Number(opp.offered_odds).toFixed(2)}</div>
                      )}
                      <Link href="/scout" className="text-[10px] px-2 py-0.5 rounded-full mt-1 inline-block transition-colors hover:text-white"
                        style={{ border: '1px solid var(--border)', color: 'var(--text-faint)' }}>
                        Analyse
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-semibold text-white">Recent bets</span>
              <Link href="/bets" className="text-xs text-slate-400 hover:text-white transition-colors">All bets</Link>
            </div>
            {recent.length === 0 ? (
              <div className="flex flex-col items-center py-8 gap-3">
                <p className="text-sm text-slate-500">No bets tracked yet.</p>
                <Link href="/bets/new" className="btn-ghost text-xs">+ Add bet</Link>
              </div>
            ) : (
              <div className="flex flex-col">
                {recent.map((bet, i) => {
                  const leg   = bet.legs?.[0]
                  const multi = (bet.legs?.length ?? 0) > 1
                  return (
                    <Link key={bet.id} href={`/bets/${bet.id}`}
                      className="flex items-center gap-3 py-2.5 hover:opacity-70 transition-opacity"
                      style={{ borderBottom: i < recent.length - 1 ? '1px solid var(--border-muted)' : 'none' }}>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-white truncate">
                          {multi ? `Parlay (${bet.legs!.length})` : leg?.event_name || '—'}
                        </div>
                        <div className="text-xs text-slate-500 truncate">
                          {multi ? bet.legs!.map(l => l.selection || l.market_type).join(' · ') : leg?.market_type}
                          {leg && !multi && <span className="font-mono"> @{leg.odds.toFixed(2)}</span>}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span className="text-xs text-slate-400 font-mono">{sym}{bet.stake}</span>
                        <StatusBadge status={bet.status} />
                      </div>
                      {bet.pnl != null && (
                        <div className="text-sm font-semibold font-mono w-14 text-right shrink-0"
                          style={{ color: bet.pnl >= 0 ? 'var(--win)' : 'var(--loss)' }}>
                          {bet.pnl >= 0 ? '+' : ''}{sym}{bet.pnl.toFixed(0)}
                        </div>
                      )}
                    </Link>
                  )
                })}
                <Link href="/bets/new"
                  className="mt-3 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm text-slate-500 hover:text-slate-300 transition-colors"
                  style={{ border: '1px dashed var(--border)' }}>
                  + Add bet
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* Bankroll bar */}
        {bankroll && (
          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold text-white">Bankroll</span>
              <Link href="/bankroll" className="text-xs text-slate-400 hover:text-white transition-colors">Manage</Link>
            </div>
            <div className="flex items-baseline gap-2 mb-4">
              <span className="text-3xl font-bold font-mono" style={{ letterSpacing: '-0.03em' }}>
                {sym}{bankroll.balance.toFixed(0)}
              </span>
              <span className="text-sm text-slate-500">{currency}</span>
            </div>
            <div className="h-1 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
              <div className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${Math.min(100, bankroll.balance > 0 ? (pendingStake / bankroll.balance) * 100 : 0)}%`,
                  background: 'linear-gradient(90deg, var(--accent), #60a5fa)',
                }} />
            </div>
            <div className="flex justify-between mt-2">
              <span className="text-xs text-slate-500">Committed {sym}{pendingStake.toFixed(0)}</span>
              <span className="text-xs text-slate-500">Free {sym}{Math.max(0, bankroll.balance - pendingStake).toFixed(0)}</span>
            </div>
          </div>
        )}
      </div>
    </>
  )
}

function StatusBadge({ status }: { status: string }) {
  const cls: Record<string, string> = {
    won: 'badge-won', lost: 'badge-lost', pending: 'badge-pending', void: 'badge-void', push: 'badge-open',
  }
  return <span className={`badge ${cls[status] ?? 'badge-open'}`}>{status}</span>
}

function fmtDate(d: string) {
  const M = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const [, m, day] = d.split('-')
  return `${parseInt(day)} ${M[parseInt(m) - 1]}`
}

const EVENT_HEADLINE: Record<string, string> = {
  'football':          'The world\nis watching.',
  'grass-tennis':      'Grass court.\nNo mercy.',
  'clay-tennis':       'Clay season.\nFight for every point.',
  'hard-tennis':       'Hard court.\nHard edge.',
  'basketball':        'Championship\nbasketball.',
  'hockey':            'On the ice.\nEvery shift counts.',
  'american-football': 'Game day.\nFind the edge.',
  'esports':           'LAN locked.\nScouting live.',
  'neutral':           'Bet smarter.\nTrack everything.',
}
