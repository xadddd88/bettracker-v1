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

import { Last24HoursAnalysis } from './Last24HoursAnalysis'
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

const FORTY_FORTY_SAMPLE = {
  period: '23–24 июля 2026',
  men: {
    matches: 12,
    games: 234,
    hits: 53,
    rate: '22,65%',
    averagePerMatch: '4,42',
  },
  women: {
    matches: 13,
    games: 290,
    hits: 93,
    rate: '32,07%',
    averagePerMatch: '7,15',
  },
  total: {
    matches: 25,
    games: 524,
    hits: 146,
    rate: '27,86%',
  },
} as const

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
          <p className="editorial-kicker">Теннис · счёт 40:40 в гейме</p>
          <BroadcastStatus status="review">Только для вас</BroadcastStatus>
        </div>
        <h1 className="mt-3 font-display text-[clamp(2.4rem,9vw,4.5rem)] font-black leading-[0.94] tracking-[-0.055em] text-bn-text">
          Серия на 40:40
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-6 text-bn-muted">
          Инструмент рассчитан на рынок «будет ли в выбранном гейме счёт 40:40 — да».
          Он подбирает размер каждой следующей ставки, но не определяет вероятность исхода
          и не размещает ставки.
        </p>
      </BroadcastPanel>

      <BroadcastPanel className="overflow-hidden p-0">
        <section className="p-5 sm:p-6" aria-labelledby="forty-forty-guide-title">
          <p className="editorial-kicker">Короткий гайд</p>
          <h2
            id="forty-forty-guide-title"
            className="mt-2 font-display text-3xl font-black tracking-[-0.045em] text-bn-text"
          >
            Как работает серия
          </h2>

          <ol className="mt-5 grid gap-px overflow-hidden rounded-control border border-bn-border-subtle bg-bn-border-subtle sm:grid-cols-3">
            <li className="bg-bn-field p-4">
              <span className="font-mono text-xs font-black text-bn-signal">01</span>
              <p className="mt-2 text-sm font-black text-bn-text">Ставка на один гейм</p>
              <p className="mt-2 text-xs leading-5 text-bn-muted">
                Перед геймом выбирается исход «40:40 — да» по заданному коэффициенту.
              </p>
            </li>
            <li className="bg-bn-field p-4">
              <span className="font-mono text-xs font-black text-bn-signal">02</span>
              <p className="mt-2 text-sm font-black text-bn-text">Нет 40:40 — следующий шаг</p>
              <p className="mt-2 text-xs leading-5 text-bn-muted">
                Проигрыш записывается, а новая ставка покрывает накопленный минус и ту же целевую прибыль.
              </p>
            </li>
            <li className="bg-bn-field p-4">
              <span className="font-mono text-xs font-black text-bn-signal">03</span>
              <p className="mt-2 text-sm font-black text-bn-text">40:40 — серия завершена</p>
              <p className="mt-2 text-xs leading-5 text-bn-muted">
                При первом выигрыше фиксируется результат серии. Возврат не увеличивает следующий шаг.
              </p>
            </li>
          </ol>

          <div className="mt-5 border-l-2 border-bn-signal pl-4">
            <p className="text-sm font-black text-bn-text">Откуда берётся прибыль</p>
            <p className="mt-1 text-xs leading-5 text-bn-muted">
              Целевая прибыль равна прибыли первой ставки: начальная ставка × (коэффициент − 1).
              Каждый следующий шаг рассчитан так, чтобы при выигрыше вернуть предыдущие потери
              и сохранить эту цель.
            </p>
          </div>
        </section>

        <Last24HoursAnalysis />

        <section
          className="border-t border-bn-border-strong"
          aria-labelledby="forty-forty-statistics-title"
        >
          <div className="p-5 sm:p-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="editorial-kicker">
                  Контрольная историческая выборка · {FORTY_FORTY_SAMPLE.period}
                </p>
                <h2
                  id="forty-forty-statistics-title"
                  className="mt-2 font-display text-2xl font-black tracking-[-0.04em] text-bn-text"
                >
                  Как часто гейм доходил до 40:40
                </h2>
              </div>
              <BroadcastStatus status="neutral">
                {FORTY_FORTY_SAMPLE.total.matches} матчей
              </BroadcastStatus>
            </div>

            <div className="mt-5 grid border-y border-bn-border-subtle sm:grid-cols-2">
              <div className="border-b border-bn-border-subtle py-4 sm:border-b-0 sm:border-r sm:pr-5">
                <span className="stat-label">Мужские матчи · ATP</span>
                <div className="mt-2 flex items-end justify-between gap-4">
                  <span className="font-display text-4xl font-black tracking-[-0.05em] text-bn-text">
                    {FORTY_FORTY_SAMPLE.men.rate}
                  </span>
                  <span className="font-mono text-xs text-bn-muted">
                    {FORTY_FORTY_SAMPLE.men.hits}/{FORTY_FORTY_SAMPLE.men.games} геймов
                  </span>
                </div>
                <p className="mt-2 text-xs leading-5 text-bn-muted">
                  {FORTY_FORTY_SAMPLE.men.matches} матчей · в среднем{' '}
                  {FORTY_FORTY_SAMPLE.men.averagePerMatch} срабатывания за матч
                </p>
              </div>
              <div className="py-4 sm:pl-5">
                <span className="stat-label">Женские матчи · WTA</span>
                <div className="mt-2 flex items-end justify-between gap-4">
                  <span className="font-display text-4xl font-black tracking-[-0.05em] text-bn-text">
                    {FORTY_FORTY_SAMPLE.women.rate}
                  </span>
                  <span className="font-mono text-xs text-bn-muted">
                    {FORTY_FORTY_SAMPLE.women.hits}/{FORTY_FORTY_SAMPLE.women.games} геймов
                  </span>
                </div>
                <p className="mt-2 text-xs leading-5 text-bn-muted">
                  {FORTY_FORTY_SAMPLE.women.matches} матчей · в среднем{' '}
                  {FORTY_FORTY_SAMPLE.women.averagePerMatch} срабатывания за матч
                </p>
              </div>
            </div>

            <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-5">
              <div>
                <dt className="stat-label">Вся выборка</dt>
                <dd className="mt-1 font-mono text-lg font-black text-bn-text">
                  {FORTY_FORTY_SAMPLE.total.rate}
                </dd>
                <dd className="mt-1 text-[11px] leading-4 text-bn-muted">
                  {FORTY_FORTY_SAMPLE.total.hits}/{FORTY_FORTY_SAMPLE.total.games} геймов
                </dd>
              </div>
              <div>
                <dt className="stat-label">Хотя бы раз</dt>
                <dd className="mt-1 font-mono text-lg font-black text-bn-text">25/25</dd>
                <dd className="mt-1 text-[11px] leading-4 text-bn-muted">матчей выборки</dd>
              </div>
              <div>
                <dt className="stat-label">До 5-го гейма</dt>
                <dd className="mt-1 font-mono text-lg font-black text-bn-text">19/25</dd>
                <dd className="mt-1 text-[11px] leading-4 text-bn-muted">первое 40:40</dd>
              </div>
              <div>
                <dt className="stat-label">До 10-го гейма</dt>
                <dd className="mt-1 font-mono text-lg font-black text-bn-text">24/25</dd>
                <dd className="mt-1 text-[11px] leading-4 text-bn-muted">первое 40:40</dd>
              </div>
              <div>
                <dt className="stat-label">До 15-го гейма</dt>
                <dd className="mt-1 font-mono text-lg font-black text-bn-text">25/25</dd>
                <dd className="mt-1 text-[11px] leading-4 text-bn-muted">первое 40:40</dd>
              </div>
            </dl>

            <p className="mt-5 text-[11px] leading-5 text-bn-quiet">
              Методика: завершённые одиночные ATP/WTA-матчи с полной историей очков;
              тай-брейки не считались обычными геймами. Источники исходных матчей —
              Flashscore point-by-point и расписание Tennis.com.
            </p>
          </div>

          <div className="border-t border-bn-border-strong bg-bn-field p-5 sm:p-6">
            <BroadcastStatus status="negative">Статистика, а не гарантия</BroadcastStatus>
            <p className="mt-3 text-xs leading-5 text-bn-muted">
              Историческая частота не предсказывает отдельный гейм или матч. Серия без 40:40
              может дойти до лимита и исчерпать весь выбранный банк. Калькулятор управляет
              только размером ставок и не делает исход более вероятным.
            </p>
          </div>
        </section>
      </BroadcastPanel>

      {loadFailed ? (
        <BroadcastPanel className="grid min-h-64 place-items-center p-6 text-center">
          <div>
            <BroadcastStatus status="negative">Серия недоступна</BroadcastStatus>
            <p className="mt-4 text-xs leading-5 text-bn-muted">
              Обновите страницу. Новые данные не были отправлены.
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
