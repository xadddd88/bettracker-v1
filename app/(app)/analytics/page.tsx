import Link from 'next/link'

import BetaNote from '@/components/ui/BetaNote'
import {
  BroadcastDataValue,
  BroadcastPanel,
  BroadcastStatus,
} from '@/components/ui/BroadcastNoir'
import { calcPerformance } from '@/lib/analytics/performance'
import { EVENTS } from '@/lib/analytics/events'
import { PageView } from '@/lib/analytics/PageView'
import { fmtPct, formatMoney } from '@/lib/money'
import { createClient } from '@/lib/supabase/server'
import type { BroadcastNoirStatus } from '@/lib/ui/broadcast-noir'
import type { Bet } from '@/types'

const SPORT_LABEL: Record<string, string> = {
  basketball: 'Basketball',
  cs2: 'CS2',
  ice_hockey: 'Ice Hockey',
  mma: 'MMA',
  mixed: 'Mixed',
  other: 'Other',
  soccer: 'Soccer',
  tennis: 'Tennis',
}

const SOURCE_LABEL: Record<string, string> = {
  ai_analyst: 'AI Analyst',
  import: 'Import',
  manual: 'Manual',
  quick_entry: 'Quick Entry',
  scanner: 'Scanner',
}

const DECISION_ACTIONS = [
  { key: 'placed', label: 'Placed', tone: 'success' },
  { key: 'watchlisted', label: 'Watchlisted', tone: 'review' },
  { key: 'pending', label: 'Pending', tone: 'review' },
  { key: 'skipped', label: 'Skipped', tone: 'neutral' },
  { key: 'ignored', label: 'Ignored', tone: 'neutral' },
] as const

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

  const bets = (betsRes.data || []) as Bet[]
  const decisions = decisionsRes.data || []
  const currency = bankrollRes.data?.currency || 'USD'
  const metrics = calcPerformance(bets, decisions)
  const pendingBets = bets.filter((bet) => bet.status === 'pending')

  return (
    <main className="bn-page mx-auto flex w-full max-w-6xl flex-col gap-4 pb-8">
      <PageView event={EVENTS.ANALYTICS_VIEWED} />

      <BroadcastPanel className="p-5 sm:p-7">
        <p className="editorial-kicker">Stats · recorded outcomes</p>
        <h1 className="mt-3 font-display text-[clamp(2.75rem,8vw,6rem)] font-black leading-none tracking-[-0.06em] text-bn-text">Performance</h1>
        <p className="mt-4 max-w-2xl text-sm leading-6 text-bn-muted">
          {bets.length} saved bet{bets.length === 1 ? '' : 's'} · {metrics.settledCount} settled · {decisions.length} decision{decisions.length === 1 ? '' : 's'}
        </p>
      </BroadcastPanel>

      {bets.length === 0 && decisions.length === 0 ? (
        <BroadcastPanel className="grid min-h-72 place-items-center p-6 text-center">
          <div className="max-w-md">
            <BroadcastStatus status="neutral">Empty · no recorded data</BroadcastStatus>
            <h2 className="mt-5 font-display text-3xl font-black tracking-[-0.04em] text-bn-text">Nothing to calculate yet</h2>
            <p className="mt-3 text-sm leading-6 text-bn-muted">Stats appear only after a bet or decision is persisted. No sample chart or estimated result is shown.</p>
            <div className="mt-6 grid gap-2 min-[420px]:grid-cols-2">
              <Link className="bn-button bn-button-secondary" href="/ai">Analyze</Link>
              <Link className="bn-button bn-button-primary" href="/bets/new">Add bet</Link>
            </div>
          </div>
        </BroadcastPanel>
      ) : (
        <>
          {metrics.settledCount > 0 && metrics.settledCount < 10 ? (
            <BetaNote>Metrics become more reliable with more settled bets. Current sample: {metrics.settledCount}.</BetaNote>
          ) : null}

          {metrics.unsupportedCount + metrics.unknownCount > 0 ? (
            <BroadcastPanel className="p-4">
              <BroadcastStatus status="review">
                {metrics.unsupportedCount + metrics.unknownCount} unsupported or unknown status{metrics.unsupportedCount + metrics.unknownCount === 1 ? '' : 'es'} excluded from financial metrics
              </BroadcastStatus>
            </BroadcastPanel>
          ) : null}

          <section aria-label="Performance metrics" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Metric label="Net P&L" note="Settled only" value={metrics.settledCount ? formatMoney(metrics.netProfit, currency, true) : '—'} />
            <Metric label="ROI" note="Void excluded" value={metrics.roi == null ? '—' : fmtPct(metrics.roi)} />
            <Metric label="Win rate" note="Won / won + lost" value={metrics.winRate == null ? '—' : `${metrics.winRate.toFixed(1)}%`} />
            <Metric label="Settled" note={`${metrics.wonCount}W · ${metrics.lostCount}L · ${metrics.voidCount}V`} value={String(metrics.settledCount)} />
            <Metric label="Pending stake" note={`${metrics.pendingCount} open`} value={metrics.pendingCount ? formatMoney(metrics.pendingStake, currency) : '—'} />
            <Metric label="Decisions" note="Persisted records" value={String(metrics.totalDecisions)} />
            <Metric label="Decision → bet" note={`${metrics.decisionsByAction.placed} placed`} value={metrics.conversionRate == null ? '—' : `${metrics.conversionRate.toFixed(1)}%`} />
            <Metric label="Average odds" note="Won/lost only" value={metrics.avgOdds == null ? '—' : metrics.avgOdds.toFixed(2)} />
          </section>

          <BroadcastPanel className="p-5 sm:p-7">
            <SectionHeader detail={`${bets.length} total`} title="Outcomes" />
            <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Outcome count={metrics.wonCount} currency={currency} label="Won" stake={stakeFor(bets, 'won')} status="success" />
              <Outcome count={metrics.lostCount} currency={currency} label="Lost" stake={stakeFor(bets, 'lost')} status="negative" />
              <Outcome count={metrics.voidCount} currency={currency} label="Void" stake={stakeFor(bets, 'void')} status="neutral" />
              <Outcome count={metrics.pendingCount} currency={currency} label="Pending" stake={metrics.pendingStake} status="review" />
            </div>
          </BroadcastPanel>

          <BroadcastPanel className="p-5 sm:p-7">
            <SectionHeader detail={`${decisions.length} total`} title="Decision actions" />
            {decisions.length === 0 ? (
              <EmptyLine><Link className="underline underline-offset-4" href="/ai">Run an analysis</Link> to create the first decision.</EmptyLine>
            ) : (
              <dl className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                {DECISION_ACTIONS.map((action) => {
                  const count = metrics.decisionsByAction[action.key] ?? 0
                  const percent = decisions.length ? (count / decisions.length) * 100 : 0
                  return (
                    <div className="rounded-control border border-bn-border-subtle p-3" key={action.key}>
                      <BroadcastStatus status={action.tone}>{action.label}</BroadcastStatus>
                      <dd><BroadcastDataValue className="mt-3 block text-2xl font-black">{count}</BroadcastDataValue></dd>
                      <dt className="mt-1 text-xs text-bn-muted">{percent.toFixed(0)}% of decisions</dt>
                    </div>
                  )
                })}
              </dl>
            )}
          </BroadcastPanel>

          <PerformanceTable currency={currency} rows={metrics.bySport.map((row) => ({ ...row, label: SPORT_LABEL[row.sport] ?? row.sport }))} title="By sport" />
          <PerformanceTable currency={currency} rows={metrics.bySource.map((row) => ({ ...row, label: SOURCE_LABEL[row.source] ?? row.source }))} title="By source" />

          <BroadcastPanel className="p-5 sm:p-7">
            <SectionHeader detail="Source = AI Analyst" title="AI Analyst records" />
            {metrics.aiAnalyst.total === 0 ? (
              <EmptyLine>No AI-sourced bets are saved yet.</EmptyLine>
            ) : (
              <dl className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
                <SmallMetric label="Bets" value={String(metrics.aiAnalyst.total)} />
                <SmallMetric label="Win rate" value={metrics.aiAnalyst.winRate == null ? '—' : `${metrics.aiAnalyst.winRate.toFixed(1)}%`} />
                <SmallMetric label="ROI" value={metrics.aiAnalyst.roi == null ? '—' : fmtPct(metrics.aiAnalyst.roi)} />
                <SmallMetric label="Net P&L" value={metrics.aiAnalyst.won + metrics.aiAnalyst.lost ? formatMoney(metrics.aiAnalyst.netProfit, currency, true) : '—'} />
              </dl>
            )}
          </BroadcastPanel>

          <BroadcastPanel className="overflow-hidden p-0">
            <div className="px-5 py-4 sm:px-7"><SectionHeader detail={`${formatMoney(metrics.pendingStake, currency)} at risk`} title="Pending risk" /></div>
            {pendingBets.length === 0 ? <EmptyLine>No open bets.</EmptyLine> : (
              <ol className="divide-y divide-bn-border-strong">
                {pendingBets.map((bet) => (
                  <li key={bet.id}>
                    <Link className="grid gap-2 px-5 py-4 transition-colors hover:bg-bn-raised sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-7" href={`/bets/${bet.id}`}>
                      <div className="min-w-0">
                        <div className="break-words text-sm font-bold text-bn-text">{bet.legs?.[0]?.event_name || 'Tracked bet'}</div>
                        <div className="mt-1 text-xs text-bn-muted">{bet.legs?.length || 0} leg{bet.legs?.length === 1 ? '' : 's'} · saved {formatDate(bet.placed_at)}</div>
                      </div>
                      <BroadcastDataValue className="text-sm font-black">{formatMoney(bet.stake, currency)} · {bet.total_odds?.toFixed(2) ?? '—'}</BroadcastDataValue>
                    </Link>
                  </li>
                ))}
              </ol>
            )}
          </BroadcastPanel>
        </>
      )}
    </main>
  )
}

function Metric({ label, note, value }: { label: string; note: string; value: string }) {
  return (
    <BroadcastPanel className="min-w-0 p-4 sm:p-5">
      <div className="font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-bn-quiet">{label}</div>
      <BroadcastDataValue className="mt-3 block break-words font-display text-2xl font-black tracking-[-0.03em]">{value}</BroadcastDataValue>
      <div className="mt-2 text-xs leading-5 text-bn-muted">{note}</div>
    </BroadcastPanel>
  )
}

function Outcome({ count, currency, label, stake, status }: { count: number; currency: string; label: string; stake: number; status: BroadcastNoirStatus }) {
  return (
    <div className="rounded-control border border-bn-border-subtle p-3">
      <BroadcastStatus status={status}>{label}</BroadcastStatus>
      <BroadcastDataValue className="mt-3 block text-2xl font-black">{count}</BroadcastDataValue>
      <div className="mt-1 text-xs text-bn-muted">{formatMoney(stake, currency)} staked</div>
    </div>
  )
}

function PerformanceTable({ currency, rows, title }: {
  currency: string
  rows: Array<{ label: string; lost: number; netProfit: number; roi: number | null; total: number; void: number; winRate: number | null; won: number }>
  title: string
}) {
  return (
    <BroadcastPanel className="overflow-hidden p-0">
      <div className="px-5 py-4 sm:px-7"><SectionHeader detail="Exact values" title={title} /></div>
      {rows.length === 0 ? <EmptyLine>No saved bets.</EmptyLine> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] border-collapse text-sm">
            <caption className="sr-only">{title} performance calculated from saved bets</caption>
            <thead>
              <tr className="border-y border-bn-border-strong text-left">
                {['Group', 'Bets', 'W / L / V', 'Win rate', 'ROI', 'P&L'].map((label, index) => (
                  <th className={`px-5 py-3 font-mono text-[11px] font-bold uppercase tracking-[0.06em] text-bn-quiet ${index ? 'text-right' : ''}`} key={label}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-bn-border-subtle">
              {rows.map((row) => (
                <tr key={row.label}>
                  <th className="px-5 py-3 text-left font-bold text-bn-text">{row.label}</th>
                  <Cell value={String(row.total)} />
                  <Cell value={`${row.won} / ${row.lost} / ${row.void}`} />
                  <Cell value={row.winRate == null ? '—' : `${row.winRate.toFixed(1)}%`} />
                  <Cell value={row.roi == null ? '—' : fmtPct(row.roi)} />
                  <Cell value={row.won + row.lost + row.void ? formatMoney(row.netProfit, currency, true) : '—'} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </BroadcastPanel>
  )
}

function Cell({ value }: { value: string }) {
  return <td className="px-5 py-3 text-right"><BroadcastDataValue>{value}</BroadcastDataValue></td>
}

function SmallMetric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-control border border-bn-border-subtle p-3"><dt className="text-xs text-bn-muted">{label}</dt><dd><BroadcastDataValue className="mt-2 block text-lg font-black">{value}</BroadcastDataValue></dd></div>
}

function SectionHeader({ detail, title }: { detail: string; title: string }) {
  return <div className="flex items-center justify-between gap-4"><h2 className="font-display text-xl font-black tracking-[-0.035em] text-bn-text">{title}</h2><span className="font-mono text-[11px] font-bold uppercase tracking-[0.06em] text-bn-quiet">{detail}</span></div>
}

function EmptyLine({ children }: { children: React.ReactNode }) {
  return <p className="px-5 py-8 text-center text-sm text-bn-muted sm:px-7">{children}</p>
}

function stakeFor(bets: Bet[], status: string) {
  return bets.filter((bet) => bet.status === status).reduce((sum, bet) => sum + bet.stake, 0)
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value))
}
