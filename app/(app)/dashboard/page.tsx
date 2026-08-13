import Link from 'next/link'

import MarketAccessCard from '@/components/market/MarketAccessCard'
import OnboardingCard from '@/components/onboarding/OnboardingCard'
import NextBestAction, { type NextAction } from '@/components/dashboard/NextBestAction'
import { BroadcastDataValue, BroadcastPanel, BroadcastStatus } from '@/components/ui/BroadcastNoir'
import SectionGuide from '@/components/ui/SectionGuide'
import { EVENTS } from '@/lib/analytics/events'
import { PageView } from '@/lib/analytics/PageView'
import { calcSettlementMetrics, isSupportedSettlementStatus } from '@/lib/bets/settlement-metrics'
import { resolveBetStatus } from '@/lib/bets/bet-status'
import { formatMoney } from '@/lib/money'
import { resolveCurrentMarketAccessPresentation } from '@/lib/market/runtime-presentation'
import { createClient } from '@/lib/supabase/server'
import type { Bet } from '@/types'

import BankrollWidget from './BankrollWidget'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [{ data: betsData }, { data: bankroll }, { data: profile }] = await Promise.all([
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

  const bets: Bet[] = betsData || []
  const metrics = calcSettlementMetrics(bets)
  const pendingBets = bets.filter((bet) => bet.status === 'pending')
  const currency = bankroll?.currency || 'USD'
  const recent = bets.slice(0, 5)
  const pendingOpenLabel = pluralRu(pendingBets.length, 'открытая ставка', 'открытые ставки', 'открытых ставок')
  const recentRecordsLabel = pluralRu(recent.length, 'запись', 'записи', 'записей')
  const legsLabel = (count: number) => pluralRu(count, 'исход', 'исхода', 'исходов')
  const marketAccess = resolveCurrentMarketAccessPresentation('ru')

  // Adaptive Action is derived only from trusted persisted state. There is no
  // durable Web draft contract yet, so Home must not claim that one exists.
  const nextAction: NextAction = pendingBets.length > 0
    ? {
        type: 'review_pending',
        label: `Проверить ${pendingBets.length} ${pendingOpenLabel}`,
        detail: 'Открой сохранённые записи и закрой результат только по факту исхода.',
        href: '/bets',
        meta: `${pendingBets.length} открыто`,
      }
    : {
        type: 'scan_coupon',
        label: 'Сканировать купон',
        detail: 'Загрузи купон, проверь редактируемый черновик и только потом сохраняй ставку.',
        href: '/ai',
        meta: 'Открытых ставок нет',
      }

  return (
    <main className="bn-page space-y-4 pb-8">
      <PageView event={EVENTS.DASHBOARD_VIEWED} props={{ bet_count: bets.length }} />
      {!profile?.onboarding_completed ? <OnboardingCard /> : null}

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(20rem,0.65fr)]">
        <BroadcastPanel className="relative overflow-hidden p-5 sm:p-7 lg:p-9">
          <div aria-hidden="true" className="absolute inset-y-0 left-0 w-1 bg-bn-signal" />
          <p className="editorial-kicker">Главная · сохранённые данные аккаунта</p>
          <h1 className="mt-4 max-w-3xl font-display text-[clamp(2.25rem,6vw,5rem)] font-black leading-[0.94] tracking-[-0.055em] text-bn-text">
            Одно полезное действие. Без выдуманного сигнала.
          </h1>
          <p className="mt-5 max-w-2xl text-sm leading-6 text-bn-muted sm:text-base">
            Проверь состояние аккаунта, сделай следующий явный шаг и оставь каждый сохранённый результат проверяемым.
          </p>
        </BroadcastPanel>

        <NextBestAction action={nextAction} />
      </section>

      <MarketAccessCard model={marketAccess} surface="home" />

      <SectionGuide
        title="Как читать главную"
        items={[
          {
            title: 'Начните со следующего действия',
            body: 'Если есть открытые ставки, главная ведёт к проверке результата. Если открытых ставок нет, она предлагает сканировать новый купон.',
          },
          {
            title: 'Смотрите только сохранённые данные',
            body: 'Портфель, P&L, ROI и последние ставки строятся из записей вашего аккаунта. Демо-сигналы и выдуманные графики сюда не попадают.',
          },
          {
            title: 'Переходите в нужный рабочий экран',
            body: 'Сканер подходит для купона с фото, ручной ввод — для ставки без скрина, а список ставок — для закрытия результата.',
          },
        ]}
        note={{
          title: 'Главное правило',
          body: 'Главная не даёт прогноз и не советует ставку сама по себе. Она показывает состояние системы и самый безопасный следующий шаг.',
        }}
      />

      <BroadcastPanel className="p-5 sm:p-7">
        <SectionHeader detail={`${metrics.pendingCount} открыто`} label="Портфель" />
        <div className="mt-6">
          <BankrollWidget balance={bankroll?.balance || 0} currency={currency} />
        </div>
        <div className="mt-7 grid grid-cols-2 border-y border-bn-border-strong sm:grid-cols-4">
          <Metric
            label="Чистый P&L"
            value={metrics.settledCount ? formatMoney(metrics.netProfit, currency, true) : '—'}
          />
          <Metric label="Записано" value={String(bets.length)} />
          <Metric label="Закрыто" value={String(metrics.settledCount)} />
          <Metric
            label="ROI"
            value={metrics.roi == null ? '—' : `${metrics.roi >= 0 ? '+' : ''}${metrics.roi.toFixed(1)}%`}
          />
        </div>
      </BroadcastPanel>

      <section className="grid gap-3 sm:grid-cols-2">
        <ActionLink href="/ai" index="A" label="Сканировать купон" primary />
        <ActionLink href="/bets/new" index="B" label="Добавить вручную" />
      </section>

      <BroadcastPanel className="overflow-hidden">
        <div className="flex min-h-16 items-center justify-between gap-4 border-b border-bn-border-strong px-5 py-3 sm:px-7">
          <SectionHeader detail={`${recent.length} ${recentRecordsLabel}`} label="Последние ставки" />
          <Link className="bn-button bn-button-secondary shrink-0" href="/bets">Все ставки</Link>
        </div>

        {recent.length === 0 ? (
          <div className="grid min-h-56 place-items-center px-5 py-12 text-center">
            <div>
              <h2 className="font-display text-3xl font-black tracking-[-0.04em] text-bn-text">Сохранённых ставок нет</h2>
              <p className="mt-3 text-sm text-bn-muted">Скан становится записью только после проверки и сохранения.</p>
              <Link className="bn-button bn-button-primary mt-6" href="/ai">Сканировать купон</Link>
            </div>
          </div>
        ) : (
          <ol aria-label="Последние сохранённые ставки" className="divide-y divide-bn-border-strong">
            {recent.map((bet, index) => {
              const legs = bet.legs || []
              const isExpress = legs.length > 1 || bet.bet_type === 'parlay'
              return (
                <li key={bet.id}>
                  <Link
                    className="group grid gap-4 px-5 py-5 transition-colors hover:bg-bn-raised sm:px-7 lg:grid-cols-[2rem_minmax(0,1fr)_8rem_9rem]"
                    href={`/bets/${bet.id}`}
                  >
                    <span className="font-mono text-xs text-bn-quiet">{String(index + 1).padStart(2, '0')}</span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-black uppercase tracking-[0.05em] text-bn-text">
                          {isExpress ? `Экспресс · ${legs.length} ${legsLabel(legs.length)}` : 'Ординар'}
                        </span>
                        <BetStatus status={bet.status} />
                      </div>
                      <ol aria-label={`${legs.length} исходов по порядку`} className="mt-3 space-y-3">
                        {legs.length ? legs.map((leg, legIndex) => (
                          <li className="grid grid-cols-[1.5rem_minmax(0,1fr)_auto] gap-2 text-sm" key={leg.id}>
                            <span className="font-mono text-[11px] text-bn-quiet">{String(legIndex + 1).padStart(2, '0')}</span>
                            <span className="min-w-0">
                              <span className="block break-words font-semibold text-bn-text">{leg.event_name}</span>
                              <span className="mt-1 block break-words text-xs text-bn-muted">
                                {[leg.market_type, leg.selection].filter(Boolean).join(' · ') || 'Выбор не записан'}
                              </span>
                            </span>
                            <BroadcastDataValue className="text-xs">{Number(leg.odds).toFixed(2)}</BroadcastDataValue>
                          </li>
                        )) : (
                          <li className="text-sm text-bn-muted">Детали исходов не записаны.</li>
                        )}
                      </ol>
                    </div>
                    <DataFact label="Ставка" value={formatMoney(bet.stake, currency)} />
                    <DataFact
                      label="Записанный P&L"
                      value={isSupportedSettlementStatus(bet.status) && bet.pnl != null
                        ? formatMoney(bet.pnl, currency, true)
                        : '—'}
                    />
                  </Link>
                </li>
              )
            })}
          </ol>
        )}
      </BroadcastPanel>
    </main>
  )
}

function ActionLink({ href, index, label, primary = false }: { href: string; index: string; label: string; primary?: boolean }) {
  return (
    <Link
      className={`group flex min-h-28 items-end justify-between gap-4 rounded-control border p-5 transition-colors ${primary ? 'border-bn-signal bg-bn-signal text-bn-on-signal' : 'border-bn-border-strong bg-bn-field text-bn-text hover:border-bn-signal'}`}
      href={href}
    >
      <span>
        <span className="block font-mono text-[11px] font-bold opacity-70">{index}</span>
        <span className="mt-6 block text-lg font-black">{label}</span>
      </span>
      <span aria-hidden="true" className="text-2xl transition-transform group-hover:translate-x-1">→</span>
    </Link>
  )
}

function BetStatus({ status }: { status: string }) {
  const resolved = resolveBetStatus(status)
  const tone = resolved.key === 'won'
    ? 'success'
    : resolved.key === 'lost'
      ? 'negative'
      : resolved.key === 'pending'
        ? 'review'
        : 'neutral'
  return <BroadcastStatus status={tone}>{resolved.label}</BroadcastStatus>
}

function DataFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="lg:text-right">
      <div className="font-mono text-[11px] font-bold uppercase tracking-[0.1em] text-bn-quiet">{label}</div>
      <BroadcastDataValue className="mt-2 block text-sm">{value}</BroadcastDataValue>
    </div>
  )
}

function SectionHeader({ detail, label }: { detail: string; label: string }) {
  return (
    <div className="flex min-w-0 flex-1 items-center justify-between gap-4">
      <h2 className="font-mono text-xs font-black uppercase tracking-[0.14em] text-bn-text">{label}</h2>
      <span className="font-mono text-[11px] font-bold uppercase tracking-[0.1em] text-bn-muted">{detail}</span>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-h-24 border-r border-bn-border-strong p-4 last:border-r-0 even:border-r-0 sm:even:border-r sm:last:border-r-0">
      <div className="font-mono text-[11px] font-bold uppercase tracking-[0.1em] text-bn-quiet">{label}</div>
      <BroadcastDataValue className="mt-3 block font-display text-2xl font-black tracking-[-0.04em]">{value}</BroadcastDataValue>
    </div>
  )
}

function pluralRu(count: number, one: string, few: string, many: string) {
  const mod10 = count % 10
  const mod100 = count % 100
  if (mod10 === 1 && mod100 !== 11) return one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few
  return many
}
