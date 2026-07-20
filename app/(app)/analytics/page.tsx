import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import type { Bet } from '@/types'
import { calcPerformance } from '@/lib/analytics/performance'
import BetaNote from '@/components/ui/BetaNote'
import { PageView } from '@/lib/analytics/PageView'
import { EVENTS } from '@/lib/analytics/events'
import { currencySymbol, fmtPnl, fmtPct } from '@/lib/money'

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
  placed: 'text-green-400', skipped: 'text-gray-400', watchlisted: 'text-yellow-400',
  ignored: 'text-gray-600', pending: 'text-gray-500',
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
      <div className="flex flex-col gap-6">
        <PageView event={EVENTS.ANALYTICS_VIEWED} />
        <div>
          <h1 className="text-2xl font-bold text-white">Analytics</h1>
          <p className="text-sm text-gray-500 mt-1">No data yet</p>
        </div>
        <div className="card text-center py-16">
          <div className="text-4xl mb-3">📈</div>
          <p className="text-gray-400 font-medium mb-1">Nothing to analyse yet</p>
          <p className="text-gray-600 text-sm">Place your first bet or run an AI analysis to start tracking performance.</p>
          <div className="flex gap-3 justify-center mt-5">
            <Link href="/ai" className="btn-ghost text-sm">🤖 Analyse match</Link>
            <Link href="/bets/new" className="btn-primary text-sm">+ Add Bet</Link>
          </div>
        </div>
      </div>
    )
  }

  const profitColor = m.netProfit >= 0 ? 'text-green-400' : 'text-red-400'
  const roiColor    = m.roi != null ? (m.roi >= 0 ? 'text-green-400' : 'text-red-400') : ''

  const totalOutcomes = m.wonCount + m.lostCount + m.voidCount + m.pendingCount
  const pctBar = (n: number) => totalOutcomes > 0 ? (n / totalOutcomes) * 100 : 0

  const decisionTotal = decisions.length
  const pendingBets   = bets.filter(b => b.status === 'pending')

  return (
    <div className="flex flex-col gap-6">
      <PageView event={EVENTS.ANALYTICS_VIEWED} />

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Analytics</h1>
        <p className="text-sm text-gray-500 mt-1">
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
          <div className={`stat-value text-xl ${m.settledCount > 0 ? profitColor : 'text-gray-600'}`}>
            {m.settledCount > 0 ? fmtPnl(m.netProfit, sym) : '—'}
          </div>
          <div className="text-xs text-gray-600">
            {m.settledCount === 0 ? 'No settled bets' : 'Settled bets only'}
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-label">ROI</div>
          <div className={`stat-value text-xl ${roiColor || 'text-gray-600'}`}>
            {m.roi != null ? fmtPct(m.roi) : '—'}
          </div>
          <div className="text-xs text-gray-600">Void excluded</div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Win Rate</div>
          <div className={`stat-value text-xl ${m.winRate != null ? 'text-white' : 'text-gray-600'}`}>
            {m.winRate != null ? `${m.winRate.toFixed(1)}%` : '—'}
          </div>
          <div className="text-xs text-gray-600">Won / (won + lost)</div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Settled Bets</div>
          <div className="stat-value text-xl text-white">{m.settledCount}</div>
          <div className="text-xs text-gray-600">{m.wonCount}W · {m.lostCount}L · {m.voidCount}V</div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Pending Stake</div>
          <div className={`stat-value text-xl ${m.pendingCount > 0 ? 'text-yellow-400' : 'text-gray-600'}`}>
            {m.pendingCount > 0 ? `${sym}${m.pendingStake.toFixed(2)}` : '—'}
          </div>
          <div className="text-xs text-gray-600">{m.pendingCount} open bets</div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Total Decisions</div>
          <div className="stat-value text-xl text-white">{m.totalDecisions}</div>
          <div className="text-xs text-gray-600">AI + manual analyses</div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Decision → Bet</div>
          <div className={`stat-value text-xl ${m.conversionRate != null ? 'text-white' : 'text-gray-600'}`}>
            {m.conversionRate != null ? `${m.conversionRate.toFixed(1)}%` : '—'}
          </div>
          <div className="text-xs text-gray-600">{m.decisionsByAction.placed} placed</div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Avg Odds</div>
          <div className={`stat-value text-xl ${m.avgOdds != null ? 'text-white' : 'text-gray-600'}`}>
            {m.avgOdds != null ? m.avgOdds.toFixed(2) : '—'}
          </div>
          <div className="text-xs text-gray-600">Won/lost bets only</div>
        </div>
      </div>

      {/* ── Outcome Breakdown ────────────────────────────────── */}
      <div className="card flex flex-col gap-4">
        <h2 className="font-semibold text-white">Outcome Breakdown</h2>

        {m.settledCount === 0 && m.pendingCount === 0 ? (
          <p className="text-sm text-gray-600 text-center py-4">No bets recorded yet.</p>
        ) : (
          <>
            {/* Stacked bar */}
            <div className="flex rounded-full overflow-hidden h-3 gap-0.5">
              {m.wonCount > 0     && <div className="bg-green-500"  style={{ width: `${pctBar(m.wonCount)}%` }} />}
              {m.lostCount > 0    && <div className="bg-red-500"    style={{ width: `${pctBar(m.lostCount)}%` }} />}
              {m.voidCount > 0    && <div className="bg-gray-600"   style={{ width: `${pctBar(m.voidCount)}%` }} />}
              {m.pendingCount > 0 && <div className="bg-yellow-600" style={{ width: `${pctBar(m.pendingCount)}%` }} />}
              {bets.length === 0  && <div className="bg-gray-800 w-full" />}
            </div>

            {/* Legend */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <OutcomeCell label="Won"     count={m.wonCount}     stake={bets.filter(b=>b.status==='won').reduce((s,b)=>s+b.stake,0)}     color="text-green-400"  dotColor="bg-green-500"  sym={sym} />
              <OutcomeCell label="Lost"    count={m.lostCount}    stake={bets.filter(b=>b.status==='lost').reduce((s,b)=>s+b.stake,0)}    color="text-red-400"    dotColor="bg-red-500"    sym={sym} />
              <OutcomeCell label="Void"    count={m.voidCount}    stake={bets.filter(b=>b.status==='void').reduce((s,b)=>s+b.stake,0)}    color="text-gray-400"   dotColor="bg-gray-600"   sym={sym} />
              <OutcomeCell label="Pending" count={m.pendingCount} stake={m.pendingStake}                                                  color="text-yellow-400" dotColor="bg-yellow-600" sym={sym} />
            </div>
          </>
        )}
      </div>

      {/* ── Decision Action Breakdown ────────────────────────── */}
      <div className="card flex flex-col gap-4">
        <h2 className="font-semibold text-white">Decision Actions</h2>

        {decisionTotal === 0 ? (
          <p className="text-sm text-gray-600 text-center py-4">
            No decisions yet. <Link href="/ai" className="text-indigo-400 hover:text-indigo-300">Run an AI analysis →</Link>
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
                  <div className="flex-1 bg-gray-800 rounded-full h-1.5">
                    <div
                      className={`h-1.5 rounded-full ${
                        action === 'placed'      ? 'bg-green-500'  :
                        action === 'watchlisted' ? 'bg-yellow-500' :
                        action === 'skipped'     ? 'bg-gray-500'   :
                        'bg-gray-700'
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="text-xs text-gray-400 w-16 text-right">
                    {count} <span className="text-gray-600">({pct.toFixed(0)}%)</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Sport Performance ────────────────────────────────── */}
      <div className="card flex flex-col gap-4">
        <h2 className="font-semibold text-white">By Sport</h2>

        {m.bySport.length === 0 ? (
          <p className="text-sm text-gray-600 text-center py-4">No bets recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-gray-800">
                  <th className="pb-2 text-xs text-gray-500 font-medium">Sport</th>
                  <th className="pb-2 text-xs text-gray-500 font-medium text-right">Bets</th>
                  <th className="pb-2 text-xs text-gray-500 font-medium text-right">W/L</th>
                  <th className="pb-2 text-xs text-gray-500 font-medium text-right">Win Rate</th>
                  <th className="pb-2 text-xs text-gray-500 font-medium text-right">ROI</th>
                  <th className="pb-2 text-xs text-gray-500 font-medium text-right">P&amp;L</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/60">
                {m.bySport.map(row => (
                  <tr key={row.sport}>
                    <td className="py-2.5 text-gray-200">
                      <span className="mr-1.5">{SPORT_ICON[row.sport] ?? '🏅'}</span>
                      {SPORT_LABEL[row.sport] ?? row.sport}
                    </td>
                    <td className="py-2.5 text-gray-300 text-right">{row.total}</td>
                    <td className="py-2.5 text-gray-400 text-right">{row.won}/{row.lost}</td>
                    <td className="py-2.5 text-right">
                      {row.winRate != null
                        ? <span className="text-white">{row.winRate.toFixed(1)}%</span>
                        : <span className="text-gray-600">—</span>}
                    </td>
                    <td className="py-2.5 text-right">
                      {row.roi != null
                        ? <span className={row.roi >= 0 ? 'text-green-400' : 'text-red-400'}>{fmtPct(row.roi)}</span>
                        : <span className="text-gray-600">—</span>}
                    </td>
                    <td className="py-2.5 text-right">
                      {(row.won + row.lost + row.void) > 0
                        ? <span className={row.netProfit >= 0 ? 'text-green-400' : 'text-red-400'}>{fmtPnl(row.netProfit, sym)}</span>
                        : <span className="text-gray-600">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Source Performance ───────────────────────────────── */}
      <div className="card flex flex-col gap-4">
        <h2 className="font-semibold text-white">By Source</h2>

        {m.bySource.length === 0 ? (
          <p className="text-sm text-gray-600 text-center py-4">No bets recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-gray-800">
                  <th className="pb-2 text-xs text-gray-500 font-medium">Source</th>
                  <th className="pb-2 text-xs text-gray-500 font-medium text-right">Bets</th>
                  <th className="pb-2 text-xs text-gray-500 font-medium text-right">W/L</th>
                  <th className="pb-2 text-xs text-gray-500 font-medium text-right">Win Rate</th>
                  <th className="pb-2 text-xs text-gray-500 font-medium text-right">ROI</th>
                  <th className="pb-2 text-xs text-gray-500 font-medium text-right">P&amp;L</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/60">
                {m.bySource.map(row => (
                  <tr key={row.source}>
                    <td className="py-2.5 text-gray-200">
                      {SOURCE_LABEL[row.source] ?? row.source}
                    </td>
                    <td className="py-2.5 text-gray-300 text-right">{row.total}</td>
                    <td className="py-2.5 text-gray-400 text-right">{row.won}/{row.lost}</td>
                    <td className="py-2.5 text-right">
                      {row.winRate != null
                        ? <span className="text-white">{row.winRate.toFixed(1)}%</span>
                        : <span className="text-gray-600">—</span>}
                    </td>
                    <td className="py-2.5 text-right">
                      {row.roi != null
                        ? <span className={row.roi >= 0 ? 'text-green-400' : 'text-red-400'}>{fmtPct(row.roi)}</span>
                        : <span className="text-gray-600">—</span>}
                    </td>
                    <td className="py-2.5 text-right">
                      {(row.won + row.lost) > 0
                        ? <span className={row.netProfit >= 0 ? 'text-green-400' : 'text-red-400'}>{fmtPnl(row.netProfit, sym)}</span>
                        : <span className="text-gray-600">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── AI Analyst Performance ───────────────────────────── */}
      <div className="card flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold text-white">AI Analyst Performance</h2>
          <span className="text-xs text-gray-600">bets placed via AI</span>
        </div>

        {m.aiAnalyst.total === 0 ? (
          <p className="text-sm text-gray-600 text-center py-4">
            No AI-sourced bets yet. <Link href="/ai" className="text-indigo-400 hover:text-indigo-300">Try the AI Analyst →</Link>
          </p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <div className="text-xs text-gray-500 mb-0.5">AI Bets</div>
              <div className="text-xl font-bold text-white">{m.aiAnalyst.total}</div>
              <div className="text-xs text-gray-600">{m.aiAnalyst.won}W · {m.aiAnalyst.lost}L</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-0.5">Win Rate</div>
              <div className="text-xl font-bold text-white">
                {m.aiAnalyst.winRate != null ? `${m.aiAnalyst.winRate.toFixed(1)}%` : '—'}
              </div>
              <div className="text-xs text-gray-600">Void excluded</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-0.5">ROI</div>
              <div className={`text-xl font-bold ${m.aiAnalyst.roi != null ? (m.aiAnalyst.roi >= 0 ? 'text-green-400' : 'text-red-400') : 'text-gray-600'}`}>
                {m.aiAnalyst.roi != null ? fmtPct(m.aiAnalyst.roi) : '—'}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-0.5">Net P&amp;L</div>
              <div className={`text-xl font-bold ${(m.aiAnalyst.won + m.aiAnalyst.lost) > 0 ? (m.aiAnalyst.netProfit >= 0 ? 'text-green-400' : 'text-red-400') : 'text-gray-600'}`}>
                {(m.aiAnalyst.won + m.aiAnalyst.lost) > 0 ? fmtPnl(m.aiAnalyst.netProfit, sym) : '—'}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Pending Risk ─────────────────────────────────────── */}
      <div className="card flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-white">Pending Risk</h2>
          {pendingBets.length > 0 && (
            <span className="text-xs text-yellow-400">{sym}{m.pendingStake.toFixed(2)} at risk</span>
          )}
        </div>

        {pendingBets.length === 0 ? (
          <p className="text-sm text-gray-600 text-center py-4">No open bets — all settled.</p>
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
                    <div className="text-sm text-white truncate">
                      {(bet.legs?.length ?? 0) > 1
                        ? `Express (${bet.legs!.length} legs)`
                        : leg?.event_name || '—'}
                    </div>
                    <div className="text-xs text-gray-500">
                      {days === 0 ? 'Today' : `${days}d ago`}
                      {bet.total_odds ? ` · @${bet.total_odds.toFixed(2)}` : ''}
                    </div>
                  </div>
                  <div className="text-sm font-medium text-yellow-400 flex-shrink-0">
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
  label, count, stake, color, dotColor, sym,
}: {
  label: string; count: number; stake: number; color: string; dotColor: string; sym: string
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        <div className={`w-2 h-2 rounded-full ${dotColor}`} />
        <span className="text-xs text-gray-500">{label}</span>
      </div>
      <div className={`text-lg font-bold ${count > 0 ? color : 'text-gray-700'}`}>{count}</div>
      {count > 0 && <div className="text-xs text-gray-600">{sym}{stake.toFixed(2)} staked</div>}
    </div>
  )
}
