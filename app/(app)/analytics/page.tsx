import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import type { Bet } from '@/types'
import { calcPerformance } from '@/lib/analytics/performance'
import BetaNote from '@/components/ui/BetaNote'
import { PageView } from '@/lib/analytics/PageView'
import { EVENTS } from '@/lib/analytics/events'
import { currencySymbol, fmtPnl, fmtPct } from '@/lib/money'
import { BroadcastDataValue } from '@/components/ui/BroadcastNoir'

const SPORT_ICON: Record<string, string> = {
  soccer: '⚽', tennis: '🎾', basketball: '🏀',
  ice_hockey: '🏒', cs2: '🎯', mma: '🥊', other: '🏅',
}
const SPORT_LABEL: Record<string, string> = {
  soccer: 'Soccer', tennis: 'Tennis', basketball: 'Basketball',
  ice_hockey: 'Ice Hockey', cs2: 'CS2', mma: 'MMA', other: 'Other',
}
const SOURCE_LABEL: Record<string, string> = {
  manual: 'Manual', scanner: 'Scanner', quick_entry: 'Quick Entry',
  ai_analyst: 'AI Analyst', import: 'Import',
}
const ACTION_LABEL: Record<string, string> = {
  placed: 'Placed', skipped: 'Skipped', watchlisted: 'Watchlisted',
  ignored: 'Ignored', pending: 'Pending',
}
const ACTION_COLOR: Record<string, string> = {
  placed: 'text-[var(--success)]', skipped: 'text-[var(--text-muted)]', watchlisted: 'text-[var(--review)]',
  ignored: 'text-[var(--text-muted)]', pending: 'text-[var(--text-muted)]',
}

export default async function AnalyticsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [betsRes, decisionsRes, bankrollRes] = await Promise.all([
    supabase
      .from('bets')
      .select('*, legs:bet_legs(*)')
      .eq('user_id', user!.id)
      .is('archived_at', null),
    supabase
      .from('decisions')
      .select('id, final_action')
      .eq('user_id', user!.id),
    supabase
      .from('bankrolls')
      .select('currency')
      .eq('user_id', user!.id)
      .eq('is_default', true)
      .single(),
  ])

  const bets       = (betsRes.data || []) as Bet[]
  const decisions  = decisionsRes.data || []
  const currency   = bankrollRes.data?.currency || 'USD'
  const sym        = currencySymbol(currency)

  const m = calcPerformance(bets, decisions)

  // Full empty state — nothing to show yet
  if (bets.length === 0 && decisions.length === 0) {
    return (
      <div className="bn-page flex flex-col gap-6">
        <PageView event={EVENTS.ANALYTICS_VIEWED} />
        <div>
          <p className="editorial-kicker">Performance desk</p>
          <h1 className="mt-2 font-display text-3xl font-black text-[var(--text-primary)]">Analytics</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">No data yet</p>
        </div>
        <div className="bn-panel px-5 py-16 text-center">
          <p className="editorial-kicker mb-2">Awaiting records</p>
          <p className="font-display text-xl font-black text-[var(--text-primary)]">Nothing to analyze yet</p>
          <p className="mt-2 text-sm text-[var(--text-muted)]">Place your first bet or run an AI analysis to start tracking performance.</p>
          <div className="mt-5 flex flex-col justify-center gap-3 sm:flex-row">
            <Link href="/ai" className="bn-button bn-button-secondary">Analyze match</Link>
            <Link href="/bets/new" className="bn-button bn-button-primary">Add Bet</Link>
          </div>
        </div>
      </div>
    )
  }

  const profitColor = m.netProfit >= 0 ? 'text-[var(--success)]' : 'text-[var(--negative)]'
  const roiColor    = m.roi != null ? (m.roi >= 0 ? 'text-[var(--success)]' : 'text-[var(--negative)]') : ''

  const totalOutcomes = m.wonCount + m.lostCount + m.voidCount + m.pendingCount
  const pctBar = (n: number) => totalOutcomes > 0 ? (n / totalOutcomes) * 100 : 0

  const decisionTotal = decisions.length
  const pendingBets   = bets.filter(b => b.status === 'pending')

  return (
    <div className="bn-page flex flex-col gap-6">
      <PageView event={EVENTS.ANALYTICS_VIEWED} />

      {/* Header */}
      <div>
        <p className="editorial-kicker">Performance desk</p>
        <h1 className="mt-2 font-display text-3xl font-black text-[var(--text-primary)]">Analytics</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          {bets.length} bets · {m.settledCount} settled · {decisions.length} decisions
        </p>
      </div>

      {m.settledCount > 0 && m.settledCount < 10 && (
        <BetaNote>
          Metrics become more reliable with more settled bets. You have {m.settledCount} settled so far — keep tracking to improve accuracy.
        </BetaNote>
      )}

      {/* ── KPI Grid ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="stat-card">
          <div className="stat-label">Net Profit</div>
          <div className={`stat-value text-xl ${m.settledCount > 0 ? profitColor : 'text-[var(--text-muted)]'}`}>
            {m.settledCount > 0 ? fmtPnl(m.netProfit, sym) : '—'}
          </div>
          <div className="text-xs text-[var(--text-muted)]">
            {m.settledCount === 0 ? 'No settled bets' : 'Settled bets only'}
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-label">ROI</div>
          <div className={`stat-value text-xl ${roiColor || 'text-[var(--text-muted)]'}`}>
            {m.roi != null ? fmtPct(m.roi) : '—'}
          </div>
          <div className="text-xs text-[var(--text-muted)]">Void excluded</div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Win Rate</div>
          <div className={`stat-value text-xl ${m.winRate != null ? 'text-[var(--data-value)]' : 'text-[var(--text-muted)]'}`}>
            {m.winRate != null ? `${m.winRate.toFixed(1)}%` : '—'}
          </div>
          <div className="text-xs text-[var(--text-muted)]">Won / (won + lost)</div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Settled Bets</div>
          <div className="stat-value text-xl">{m.settledCount}</div>
          <div className="text-xs text-[var(--text-muted)]">{m.wonCount}W · {m.lostCount}L · {m.voidCount}V</div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Pending Stake</div>
          <div className={`stat-value text-xl ${m.pendingCount > 0 ? 'text-[var(--review)]' : 'text-[var(--text-muted)]'}`}>
            {m.pendingCount > 0 ? `${sym}${m.pendingStake.toFixed(2)}` : '—'}
          </div>
          <div className="text-xs text-[var(--text-muted)]">{m.pendingCount} open bets</div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Total Decisions</div>
          <div className="stat-value text-xl">{m.totalDecisions}</div>
          <div className="text-xs text-[var(--text-muted)]">AI + manual analyses</div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Decision → Bet</div>
          <div className={`stat-value text-xl ${m.conversionRate != null ? 'text-[var(--data-value)]' : 'text-[var(--text-muted)]'}`}>
            {m.conversionRate != null ? `${m.conversionRate.toFixed(1)}%` : '—'}
          </div>
          <div className="text-xs text-[var(--text-muted)]">{m.decisionsByAction.placed} placed</div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Avg Odds</div>
          <BroadcastDataValue className="stat-value text-xl">
            {m.avgOdds != null ? m.avgOdds.toFixed(2) : '—'}
          </BroadcastDataValue>
          <div className="text-xs text-[var(--text-muted)]">Won/lost bets only</div>
        </div>
      </div>

      {/* ── Outcome Breakdown ────────────────────────────────── */}
      <div className="bn-panel flex flex-col gap-4 p-4 sm:p-5">
        <h2 className="font-display text-lg font-black text-[var(--text-primary)]">Outcome Breakdown</h2>

        {m.settledCount === 0 && m.pendingCount === 0 ? (
          <p className="py-4 text-center text-sm text-[var(--text-muted)]">No bets recorded yet.</p>
        ) : (
          <>
            {/* Stacked bar */}
            <div className="flex h-3 overflow-hidden border border-[var(--border-strong)] bg-[var(--field-raised)] gap-0.5">
              {m.wonCount > 0     && <div className="bg-[var(--success)]"  style={{ width: `${pctBar(m.wonCount)}%` }} />}
              {m.lostCount > 0    && <div className="bg-[var(--negative)]" style={{ width: `${pctBar(m.lostCount)}%` }} />}
              {m.voidCount > 0    && <div className="bg-[var(--text-muted)]" style={{ width: `${pctBar(m.voidCount)}%` }} />}
              {m.pendingCount > 0 && <div className="bg-[var(--review)]" style={{ width: `${pctBar(m.pendingCount)}%` }} />}
            </div>

            {/* Legend */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <OutcomeCell label="Won"     count={m.wonCount}     stake={bets.filter(b=>b.status==='won').reduce((s,b)=>s+b.stake,0)}     color="text-[var(--success)]"  symbol="✓" sym={sym} />
              <OutcomeCell label="Lost"    count={m.lostCount}    stake={bets.filter(b=>b.status==='lost').reduce((s,b)=>s+b.stake,0)}    color="text-[var(--negative)]" symbol="×" sym={sym} />
              <OutcomeCell label="Void"    count={m.voidCount}    stake={bets.filter(b=>b.status==='void').reduce((s,b)=>s+b.stake,0)}    color="text-[var(--text-muted)]" symbol="•" sym={sym} />
              <OutcomeCell label="Pending" count={m.pendingCount} stake={m.pendingStake}                                                  color="text-[var(--review)]" symbol="!" sym={sym} />
            </div>
          </>
        )}
      </div>

      {/* ── Decision Action Breakdown ────────────────────────── */}
      <div className="bn-panel flex flex-col gap-4 p-4 sm:p-5">
        <h2 className="font-display text-lg font-black text-[var(--text-primary)]">Decision Actions</h2>

        {decisionTotal === 0 ? (
          <p className="py-4 text-center text-sm text-[var(--text-muted)]">
            No decisions yet. <Link href="/ai" className="font-bold text-[var(--signal)]">Run an AI analysis →</Link>
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {(['placed', 'skipped', 'watchlisted', 'ignored', 'pending'] as const).map(action => {
              const count = m.decisionsByAction[action] ?? 0
              const pct   = decisionTotal > 0 ? (count / decisionTotal) * 100 : 0
              return (
                <div key={action} className="flex items-center gap-3">
                  <div className={`text-xs w-20 font-medium ${ACTION_COLOR[action]}`}>
                    {ACTION_LABEL[action]}
                  </div>
                  <div className="h-1.5 flex-1 bg-[var(--field-raised)]">
                    <div
                      className={`h-1.5 ${
                        action === 'placed'      ? 'bg-[var(--success)]'  :
                        action === 'watchlisted' ? 'bg-[var(--review)]' :
                        'bg-[var(--border-strong)]'
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="w-16 text-right text-xs text-[var(--data-value)]">
                    {count} <span className="text-[var(--text-muted)]">({pct.toFixed(0)}%)</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Sport Performance ────────────────────────────────── */}
      <div className="bn-panel flex flex-col gap-4 p-4 sm:p-5">
        <h2 className="font-display text-lg font-black text-[var(--text-primary)]">By Sport</h2>

        {m.bySport.length === 0 ? (
          <p className="py-4 text-center text-sm text-[var(--text-muted)]">No bets recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border-subtle)] text-left">
                  <th className="pb-2 text-xs font-medium text-[var(--text-muted)]">Sport</th>
                  <th className="pb-2 text-right text-xs font-medium text-[var(--text-muted)]">Bets</th>
                  <th className="pb-2 text-right text-xs font-medium text-[var(--text-muted)]">W/L</th>
                  <th className="pb-2 text-right text-xs font-medium text-[var(--text-muted)]">Win Rate</th>
                  <th className="pb-2 text-right text-xs font-medium text-[var(--text-muted)]">ROI</th>
                  <th className="pb-2 text-right text-xs font-medium text-[var(--text-muted)]">P&amp;L</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {m.bySport.map(row => (
                  <tr key={row.sport}>
                    <td className="py-2.5 text-[var(--text-primary)]">
                      <span className="mr-1.5">{SPORT_ICON[row.sport] ?? '🏅'}</span>
                      {SPORT_LABEL[row.sport] ?? row.sport}
                    </td>
                    <td className="py-2.5 text-right text-[var(--data-value)]">{row.total}</td>
                    <td className="py-2.5 text-right text-[var(--text-muted)]">{row.won}/{row.lost}</td>
                    <td className="py-2.5 text-right">
                      {row.winRate != null
                        ? <span className="text-[var(--data-value)]">{row.winRate.toFixed(1)}%</span>
                        : <span className="text-[var(--text-muted)]">—</span>}
                    </td>
                    <td className="py-2.5 text-right">
                      {row.roi != null
                        ? <span className={row.roi >= 0 ? 'text-[var(--success)]' : 'text-[var(--negative)]'}>{fmtPct(row.roi)}</span>
                        : <span className="text-[var(--text-muted)]">—</span>}
                    </td>
                    <td className="py-2.5 text-right">
                      {(row.won + row.lost + row.void) > 0
                        ? <span className={row.netProfit >= 0 ? 'text-[var(--success)]' : 'text-[var(--negative)]'}>{fmtPnl(row.netProfit, sym)}</span>
                        : <span className="text-[var(--text-muted)]">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Source Performance ───────────────────────────────── */}
      <div className="bn-panel flex flex-col gap-4 p-4 sm:p-5">
        <h2 className="font-display text-lg font-black text-[var(--text-primary)]">By Source</h2>

        {m.bySource.length === 0 ? (
          <p className="py-4 text-center text-sm text-[var(--text-muted)]">No bets recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border-subtle)] text-left">
                  <th className="pb-2 text-xs font-medium text-[var(--text-muted)]">Source</th>
                  <th className="pb-2 text-right text-xs font-medium text-[var(--text-muted)]">Bets</th>
                  <th className="pb-2 text-right text-xs font-medium text-[var(--text-muted)]">W/L</th>
                  <th className="pb-2 text-right text-xs font-medium text-[var(--text-muted)]">Win Rate</th>
                  <th className="pb-2 text-right text-xs font-medium text-[var(--text-muted)]">ROI</th>
                  <th className="pb-2 text-right text-xs font-medium text-[var(--text-muted)]">P&amp;L</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {m.bySource.map(row => (
                  <tr key={row.source}>
                    <td className="py-2.5 text-[var(--text-primary)]">
                      {SOURCE_LABEL[row.source] ?? row.source}
                    </td>
                    <td className="py-2.5 text-right text-[var(--data-value)]">{row.total}</td>
                    <td className="py-2.5 text-right text-[var(--text-muted)]">{row.won}/{row.lost}</td>
                    <td className="py-2.5 text-right">
                      {row.winRate != null
                        ? <span className="text-[var(--data-value)]">{row.winRate.toFixed(1)}%</span>
                        : <span className="text-[var(--text-muted)]">—</span>}
                    </td>
                    <td className="py-2.5 text-right">
                      {row.roi != null
                        ? <span className={row.roi >= 0 ? 'text-[var(--success)]' : 'text-[var(--negative)]'}>{fmtPct(row.roi)}</span>
                        : <span className="text-[var(--text-muted)]">—</span>}
                    </td>
                    <td className="py-2.5 text-right">
                      {(row.won + row.lost) > 0
                        ? <span className={row.netProfit >= 0 ? 'text-[var(--success)]' : 'text-[var(--negative)]'}>{fmtPnl(row.netProfit, sym)}</span>
                        : <span className="text-[var(--text-muted)]">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── AI Analyst Performance ───────────────────────────── */}
      <div className="bn-panel flex flex-col gap-4 p-4 sm:p-5">
        <div className="flex items-center gap-2">
          <h2 className="font-display text-lg font-black text-[var(--text-primary)]">AI Analyst Performance</h2>
          <span className="text-xs text-[var(--text-muted)]">bets placed via AI</span>
        </div>

        {m.aiAnalyst.total === 0 ? (
          <p className="py-4 text-center text-sm text-[var(--text-muted)]">
            No AI-sourced bets yet. <Link href="/ai" className="font-bold text-[var(--signal)]">Try the AI Analyst →</Link>
          </p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <div className="mb-0.5 text-xs text-[var(--text-muted)]">AI Bets</div>
              <div className="text-xl font-bold text-[var(--data-value)]">{m.aiAnalyst.total}</div>
              <div className="text-xs text-[var(--text-muted)]">{m.aiAnalyst.won}W · {m.aiAnalyst.lost}L</div>
            </div>
            <div>
              <div className="mb-0.5 text-xs text-[var(--text-muted)]">Win Rate</div>
              <div className="text-xl font-bold text-[var(--data-value)]">
                {m.aiAnalyst.winRate != null ? `${m.aiAnalyst.winRate.toFixed(1)}%` : '—'}
              </div>
              <div className="text-xs text-[var(--text-muted)]">Void excluded</div>
            </div>
            <div>
              <div className="mb-0.5 text-xs text-[var(--text-muted)]">ROI</div>
              <div className={`text-xl font-bold ${m.aiAnalyst.roi != null ? (m.aiAnalyst.roi >= 0 ? 'text-[var(--success)]' : 'text-[var(--negative)]') : 'text-[var(--text-muted)]'}`}>
                {m.aiAnalyst.roi != null ? fmtPct(m.aiAnalyst.roi) : '—'}
              </div>
            </div>
            <div>
              <div className="mb-0.5 text-xs text-[var(--text-muted)]">Net P&amp;L</div>
              <div className={`text-xl font-bold ${(m.aiAnalyst.won + m.aiAnalyst.lost) > 0 ? (m.aiAnalyst.netProfit >= 0 ? 'text-[var(--success)]' : 'text-[var(--negative)]') : 'text-[var(--text-muted)]'}`}>
                {(m.aiAnalyst.won + m.aiAnalyst.lost) > 0 ? fmtPnl(m.aiAnalyst.netProfit, sym) : '—'}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Pending Risk ─────────────────────────────────────── */}
      <div className="bn-panel flex flex-col gap-4 p-4 sm:p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-black text-[var(--text-primary)]">Pending Risk</h2>
          {pendingBets.length > 0 && (
            <span className="bn-status bn-status-review"><span className="bn-status-icon" aria-hidden>!</span>{sym}{m.pendingStake.toFixed(2)} at risk</span>
          )}
        </div>

        {pendingBets.length === 0 ? (
          <p className="py-4 text-center text-sm text-[var(--text-muted)]">No open bets — all settled.</p>
        ) : (
          <div className="flex flex-col divide-y divide-gray-800">
            {pendingBets.map(bet => {
              const leg  = bet.legs?.[0]
              const days = Math.floor((Date.now() - new Date(bet.placed_at).getTime()) / 86400000)
              return (
                <Link
                  key={bet.id}
                  href={`/bets/${bet.id}`}
                  className="flex items-center gap-3 py-3 hover:opacity-80 transition-opacity"
                >
                  <span className="text-lg flex-shrink-0">
                    {SPORT_ICON[leg?.sport ?? ''] ?? '🎯'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="truncate text-sm text-[var(--text-primary)]">
                      {(bet.legs?.length ?? 0) > 1
                        ? `Express (${bet.legs!.length} legs)`
                        : leg?.event_name || '—'}
                    </div>
                    <div className="text-xs text-[var(--text-muted)]">
                      {days === 0 ? 'Today' : `${days}d ago`}
                      {bet.total_odds ? ` · @${bet.total_odds.toFixed(2)}` : ''}
                    </div>
                  </div>
                  <div className="flex-shrink-0 text-sm font-medium text-[var(--review)]">
                    {sym}{bet.stake.toFixed(2)}
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function OutcomeCell({
  label, count, stake, color, symbol, sym,
}: {
  label: string; count: number; stake: number; color: string; symbol: string; sym: string
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        <span className={color} aria-hidden>{symbol}</span>
        <span className="text-xs text-[var(--text-muted)]">{label}</span>
      </div>
      <div className={`text-lg font-bold ${count > 0 ? color : 'text-[var(--text-muted)]'}`}>{count}</div>
      {count > 0 && <div className="text-xs text-[var(--text-muted)]">{sym}{stake.toFixed(2)} staked</div>}
    </div>
  )
}
