import Link from 'next/link'
import { ArrowRight, ClipboardCheck, FilePenLine, ScanLine } from 'lucide-react'

import { PageView } from '@/lib/analytics/PageView'
import { EVENTS } from '@/lib/analytics/events'
import { resolveBetStatus, type BetStatusKey } from '@/lib/bets/bet-status'
import { calcSettlementMetrics, isSupportedSettlementStatus } from '@/lib/bets/settlement-metrics'
import { resolveAdaptiveAction } from '@/lib/dashboard/adaptive-action.mjs'
import { createClient } from '@/lib/supabase/server'
import { BroadcastStatus } from '@/components/ui/BroadcastNoir'
import OnboardingCard from '@/components/onboarding/OnboardingCard'
import type { Bet, BetLeg } from '@/types'

type PresentableLeg = BetLeg & { leg_index?: number | null }

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [betsResult, bankrollResult, profileResult] = await Promise.all([
    supabase
      .from('bets')
      .select('*, legs:bet_legs(*)')
      .eq('user_id', user!.id)
      .is('archived_at', null)
      .order('placed_at', { ascending: false }),
    supabase
      .from('bankrolls')
      .select('balance, currency')
      .eq('user_id', user!.id)
      .eq('is_default', true)
      .single(),
    supabase
      .from('profiles')
      .select('onboarding_completed')
      .eq('id', user!.id)
      .single(),
  ])

  const betsAvailable = !betsResult.error
  const bankrollAvailable = !bankrollResult.error && bankrollResult.data != null
  const bets: Bet[] = betsResult.data || []
  const metrics = calcSettlementMetrics(bets)
  const pendingCount = bets.filter(bet => bet.status === 'pending').length
  const recent = bets.slice(0, 5)
  const currency = bankrollResult.data?.currency || 'USD'
  const sym = currencySymbol(currency)
  const action = betsAvailable
    ? resolveAdaptiveAction({ draftAvailable: false, pendingCount })
    : null

  return (
    <div className="space-y-8">
      <PageView event={EVENTS.DASHBOARD_VIEWED} props={{ bet_count: bets.length }} />

      {!profileResult.data?.onboarding_completed && !profileResult.error ? <OnboardingCard /> : null}

      <section
        aria-labelledby="home-action-title"
        className="relative isolate min-h-[360px] overflow-hidden border border-[var(--border-strong)] bg-[var(--field)] px-5 py-6 sm:min-h-[420px] sm:px-8 sm:py-8 lg:px-12 lg:py-10"
      >
        <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-[38%] border-l border-[var(--border-subtle)] lg:block" aria-hidden="true">
          <div className="absolute inset-x-8 top-1/2 border-t border-[var(--border-subtle)]" />
          <div className="absolute inset-y-8 left-1/2 border-l border-[var(--border-subtle)]" />
        </div>

        <div className="relative z-10 flex min-h-[308px] max-w-4xl flex-col sm:min-h-[356px]">
          <div className="flex flex-wrap items-center justify-between gap-3 font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--text-quiet)]">
            <span>Home / Adaptive action</span>
            <span>{betsAvailable ? 'Account state synced' : 'Account state unavailable'}</span>
          </div>

          {action ? (
            <div className="my-auto py-10">
              <div className="mb-6 flex h-12 w-12 items-center justify-center border border-[var(--border-strong)] bg-[var(--field-raised)] text-[var(--signal)]">
                <ActionIcon kind={action.kind} />
              </div>
              <p className="font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">{action.meta}</p>
              <h1 id="home-action-title" className="mt-3 max-w-3xl font-display text-[clamp(2.45rem,7vw,5.8rem)] font-black uppercase leading-[0.88] tracking-[-0.055em] text-[var(--text-primary)]">
                {action.label}
              </h1>
              <p className="mt-6 max-w-xl text-sm leading-6 text-[var(--text-muted)] sm:text-base">{action.detail}</p>
            </div>
          ) : (
            <div className="my-auto py-10">
              <BroadcastStatus status="review">Sync interrupted</BroadcastStatus>
              <h1 id="home-action-title" className="mt-5 font-display text-4xl font-black uppercase tracking-[-0.045em] text-[var(--text-primary)] sm:text-6xl">
                Home data unavailable
              </h1>
              <p className="mt-5 max-w-lg text-sm leading-6 text-[var(--text-muted)]">No action is suggested until account state can be read again.</p>
            </div>
          )}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            {action ? (
              <Link href={action.href} className="btn-primary w-full sm:w-auto">
                {action.kind === 'review_pending' ? 'Open tracker' : action.kind === 'continue_draft' ? 'Open draft' : 'Open scanner'}
                <ArrowRight aria-hidden="true" className="h-4 w-4" />
              </Link>
            ) : (
              <Link href="/dashboard" className="btn-ghost w-full sm:w-auto">Retry account sync</Link>
            )}
            <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--text-quiet)]">No automatic save or settlement</span>
          </div>
        </div>
      </section>

      <section aria-label="Portfolio summary" className="grid grid-cols-2 border border-[var(--border-strong)] md:grid-cols-4">
        <HomeMetric
          label="Bankroll"
          value={bankrollAvailable ? formatAmount(bankrollResult.data!.balance, sym) : '—'}
        />
        <HomeMetric
          label="Net P&L"
          value={betsAvailable && metrics.settledCount > 0 ? formatSigned(metrics.netProfit, sym) : '—'}
        />
        <HomeMetric label="Open bets" value={betsAvailable ? String(metrics.pendingCount) : '—'} />
        <HomeMetric
          label="ROI"
          value={betsAvailable && metrics.roi != null ? `${metrics.roi >= 0 ? '+' : ''}${metrics.roi.toFixed(1)}%` : '—'}
        />
      </section>

      <section aria-labelledby="recent-bets-title" className="border-y border-[var(--border-strong)]">
        <div className="flex min-h-16 flex-wrap items-center justify-between gap-3 border-b border-[var(--border-strong)] py-3">
          <div>
            <p className="font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--text-quiet)]">Recent records</p>
            <h2 id="recent-bets-title" className="mt-1 font-display text-2xl font-black uppercase tracking-[-0.035em] text-[var(--text-primary)]">Single & Express</h2>
          </div>
          <Link href="/bets" className="btn-ghost">View tracker <ArrowRight aria-hidden="true" className="h-4 w-4" /></Link>
        </div>

        {!betsAvailable ? (
          <div className="py-12 text-sm text-[var(--text-muted)]">Recent records remain hidden until account state is available.</div>
        ) : recent.length === 0 ? (
          <div className="py-12">
            <p className="font-display text-3xl font-black uppercase tracking-[-0.04em] text-[var(--text-primary)]">No tracked records</p>
            <p className="mt-3 text-sm text-[var(--text-muted)]">The scanner prepares an editable draft. You decide whether to save it.</p>
          </div>
        ) : (
          <ol>
            {recent.map((bet, index) => (
              <RecentBet key={bet.id} bet={bet} index={index} sym={sym} />
            ))}
          </ol>
        )}
      </section>
    </div>
  )
}

function ActionIcon({ kind }: { kind: string }) {
  if (kind === 'review_pending') return <ClipboardCheck aria-hidden="true" className="h-6 w-6" />
  if (kind === 'continue_draft') return <FilePenLine aria-hidden="true" className="h-6 w-6" />
  return <ScanLine aria-hidden="true" className="h-6 w-6" />
}

function HomeMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 border-b border-r border-[var(--border-subtle)] p-4 even:border-r-0 md:border-b-0 md:even:border-r md:last:border-r-0 md:p-5">
      <div className="font-mono text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--text-quiet)]">{label}</div>
      <div className="mt-3 break-words font-display text-2xl font-black tracking-[-0.035em] text-[var(--data-value)] sm:text-3xl">{value}</div>
    </div>
  )
}

function RecentBet({ bet: sourceBet, index, sym }: { bet: Bet; index: number; sym: string }) {
  const bet = { ...sourceBet, legs: orderedLegs(sourceBet.legs) }
  const legs = bet.legs
  const express = bet.bet_type === 'parlay' || legs.length > 1
  const legacyExpress = express && legs.length <= 1
  const totalOdds = finiteNumber(bet.total_odds)

  return (
    <li className="border-b border-[var(--border-subtle)] last:border-b-0">
      <Link href={`/bets/${bet.id}`} className="group grid min-w-0 grid-cols-[32px_minmax(0,1fr)] gap-3 py-5 focus:outline-none sm:grid-cols-[42px_minmax(0,1fr)_auto] sm:px-2">
        <span className="pt-1 font-mono text-[11px] text-[var(--text-quiet)]">{String(index + 1).padStart(2, '0')}</span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[11px] font-black uppercase tracking-[0.1em] text-[var(--text-muted)]">
              {express ? legacyExpress ? 'Legacy Express' : `Express / ${legs.length} legs` : 'Single'}
            </span>
            <StatusBadge status={bet.status} />
          </div>

          {express && !legacyExpress ? (
            <ol className="mt-4 space-y-3" aria-label={`${legs.length} ordered Express legs`}>
              {bet.legs!.map((item, legIndex) => (
                <li key={item.id} className="grid min-w-0 grid-cols-[24px_minmax(0,1fr)_auto] gap-2 text-xs">
                  <span className="font-mono text-[11px] text-[var(--text-quiet)]">{String(legIndex + 1).padStart(2, '0')}</span>
                  <span className="min-w-0">
                    <span className="block break-words font-semibold text-[var(--text-primary)]">{item.event_name}</span>
                    <span className="mt-1 block break-words text-[var(--text-muted)]">
                      {[item.market_type, item.selection].filter(Boolean).join(' · ') || 'Selection not recorded'}
                    </span>
                  </span>
                  <span className="bn-data-value text-xs">{Number.isFinite(Number(item.odds)) ? Number(item.odds).toFixed(2) : '—'}</span>
                </li>
              ))}
            </ol>
          ) : (
            <div className="mt-3 min-w-0">
              <p className="break-words text-sm font-bold text-[var(--text-primary)]">{legs[0]?.event_name || (legacyExpress ? 'Original Express legs unavailable' : 'Event not recorded')}</p>
              <p className="mt-1 break-words text-xs text-[var(--text-muted)]">
                {legacyExpress ? 'Open the record to review its preserved legacy data.' : [legs[0]?.market_type, legs[0]?.selection].filter(Boolean).join(' · ') || 'Selection not recorded'}
              </p>
            </div>
          )}

          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--text-quiet)] sm:hidden">
            <span>Odds <span className="bn-data-value">{totalOdds?.toFixed(2) || '—'}</span></span>
            <span>Stake <span className="bn-data-value">{formatAmount(bet.stake, sym)}</span></span>
            {presentablePnl(bet, sym)}
          </div>
        </div>

        <div className="hidden min-w-44 grid-cols-2 gap-5 text-right sm:grid">
          <div>
            <div className="font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--text-quiet)]">Total odds</div>
            <div className="mt-2 font-mono text-sm font-bold text-[var(--data-value)]">{totalOdds?.toFixed(2) || '—'}</div>
          </div>
          <div>
            <div className="font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--text-quiet)]">Stake</div>
            <div className="mt-2 font-mono text-sm font-bold text-[var(--data-value)]">{formatAmount(bet.stake, sym)}</div>
            <div className="mt-2">{presentablePnl(bet, sym)}</div>
          </div>
        </div>
      </Link>
    </li>
  )
}

function StatusBadge({ status }: { status: string }) {
  const tones: Record<BetStatusKey, 'success' | 'review' | 'negative' | 'neutral'> = {
    won: 'success',
    lost: 'negative',
    pending: 'review',
    void: 'neutral',
    push: 'neutral',
    cashed_out: 'neutral',
    partial: 'neutral',
    unknown: 'neutral',
  }
  const resolved = resolveBetStatus(status)
  return <BroadcastStatus status={tones[resolved.key]}>{resolved.label}</BroadcastStatus>
}

function orderedLegs(legs: BetLeg[] | undefined): PresentableLeg[] {
  return [...(legs || [])].sort((left, right) => {
    const leftIndex = Number.isInteger((left as PresentableLeg).leg_index) ? (left as PresentableLeg).leg_index! : null
    const rightIndex = Number.isInteger((right as PresentableLeg).leg_index) ? (right as PresentableLeg).leg_index! : null
    if (leftIndex != null && rightIndex != null) return leftIndex - rightIndex
    if (leftIndex != null) return -1
    if (rightIndex != null) return 1
    return left.created_at.localeCompare(right.created_at) || left.id.localeCompare(right.id)
  })
}

function finiteNumber(value: number | null | undefined): number | null {
  if (value == null) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function currencySymbol(currency: string): string {
  if (currency === 'USD') return '$'
  if (currency === 'EUR') return '€'
  if (currency === 'UAH') return '₴'
  if (currency === 'GBP') return '£'
  return `${currency} `
}

function formatAmount(value: number, sym: string): string {
  const amount = finiteNumber(value)
  return amount == null ? '—' : `${sym}${amount.toFixed(2)}`
}

function formatSigned(value: number, sym: string): string {
  const amount = finiteNumber(value)
  return amount == null ? '—' : `${amount >= 0 ? '+' : '-'}${sym}${Math.abs(amount).toFixed(2)}`
}

function presentablePnl(bet: Bet, sym: string) {
  if (!isSupportedSettlementStatus(bet.status) || bet.pnl == null) return null
  return (
    <span className={bet.pnl >= 0 ? 'text-[var(--success)]' : 'text-[var(--negative)]'}>
      P&L {formatSigned(bet.pnl, sym)}
    </span>
  )
}
