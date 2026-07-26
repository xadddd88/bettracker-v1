import { notFound, redirect } from 'next/navigation'

import { BroadcastPanel, BroadcastStatus } from '@/components/ui/BroadcastNoir'
import { EVENTS } from '@/lib/analytics/events'
import { PageView } from '@/lib/analytics/PageView'
import { checkTennisCalcAccess } from '@/lib/flags/tennis-calc'
import { createClient } from '@/lib/supabase/server'
import type {
  TennisSeriesSnapshot,
  TennisStepSnapshot,
} from '@/lib/tennis/ui-contract'

import { SeriesCalculator } from './SeriesCalculator'

const SERIES_SELECT = `
  id,
  status,
  target_profit:target_profit::text,
  initial_stake:initial_stake::text,
  stake_increment:stake_increment::text,
  currency_or_unit,
  bankroll_limit:bankroll_limit::text,
  maximum_stake:maximum_stake::text,
  maximum_steps,
  exposure_limit:exposure_limit::text,
  formula_version,
  version,
  match_label,
  created_at,
  closed_at
`

const STEPS_SELECT = `
  id,
  step_number,
  set_number,
  game_number,
  quoted_odds:quoted_odds::text,
  recommended_stake:recommended_stake::text,
  accepted_odds:accepted_odds::text,
  accepted_stake:accepted_stake::text,
  actual_return:actual_return::text,
  status,
  loss_before:loss_before::text,
  target_profit_snapshot:target_profit_snapshot::text,
  projected_series_result:projected_series_result::text,
  confirmed_at,
  settled_at
`

export default async function TennisCalculatorPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  if (!checkTennisCalcAccess(user.id).allowed) notFound()

  const openResult = await supabase
    .from('tennis_series')
    .select(SERIES_SELECT)
    .in('status', ['draft', 'active'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  let series = openResult.data
  let loadFailed = openResult.error !== null

  if (!series && !loadFailed) {
    const latestResult = await supabase
      .from('tennis_series')
      .select(SERIES_SELECT)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    series = latestResult.data
    loadFailed = latestResult.error !== null
  }

  let snapshot: TennisSeriesSnapshot | null = null
  if (series && !loadFailed) {
    const stepsResult = await supabase
      .from('tennis_series_steps')
      .select(STEPS_SELECT)
      .eq('series_id', series.id)
      .order('step_number', { ascending: true })

    loadFailed = stepsResult.error !== null
    if (!loadFailed) {
      snapshot = {
        ...(series as unknown as Omit<TennisSeriesSnapshot, 'steps'>),
        steps: (stepsResult.data ?? []) as unknown as TennisStepSnapshot[],
      }
    }
  }

  return (
    <main className="bn-page mx-auto flex w-full max-w-3xl flex-col gap-4 pb-8">
      <PageView event={EVENTS.TENNIS_CALCULATOR_VIEWED} />
      <BroadcastPanel className="p-5 sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="editorial-kicker">Training tool · manual entry</p>
          <BroadcastStatus status="review">Internal</BroadcastStatus>
        </div>
        <h1 className="mt-3 font-display text-[clamp(2.6rem,11vw,5.5rem)] font-black leading-[0.92] tracking-[-0.06em] text-bn-text">
          Live Series
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-6 text-bn-muted">
          Recalculate one tennis step at a time from current odds and recorded outcomes.
          Manual training support only — no bet is placed by BetTracker.
        </p>
      </BroadcastPanel>

      {loadFailed ? (
        <BroadcastPanel className="grid min-h-64 place-items-center p-6 text-center">
          <div>
            <BroadcastStatus status="negative">Series unavailable</BroadcastStatus>
            <p className="mt-4 text-xs leading-5 text-bn-muted">
              Refresh the page. No command was submitted.
            </p>
          </div>
        </BroadcastPanel>
      ) : (
        <SeriesCalculator
          key={`${snapshot?.id ?? 'new'}:${snapshot?.version ?? 0}`}
          initialSeries={snapshot}
        />
      )}
    </main>
  )
}
