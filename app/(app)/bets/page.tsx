import Link from 'next/link'

import QuickSettle from '@/components/bets/QuickSettle'
import {
  BroadcastDataValue,
  BroadcastPanel,
  BroadcastStatus,
} from '@/components/ui/BroadcastNoir'
import SectionGuide from '@/components/ui/SectionGuide'
import { EVENTS } from '@/lib/analytics/events'
import { PageView } from '@/lib/analytics/PageView'
import { resolveBetStatus, type BetStatusKey } from '@/lib/bets/bet-status'
import { calcSettlementMetrics, isSupportedSettlementStatus } from '@/lib/bets/settlement-metrics'
import { formatMoney } from '@/lib/money'
import { createClient } from '@/lib/supabase/server'
import type { BroadcastNoirStatus } from '@/lib/ui/broadcast-noir'
import type { Bet } from '@/types'

export default async function BetsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [{ data }, { data: bankroll }] = await Promise.all([
    supabase
      .from('bets')
      .select('*, legs:bet_legs(*)')
      .eq('user_id', user!.id)
      .is('archived_at', null)
      .order('placed_at', { ascending: false })
      .order('leg_index', { referencedTable: 'bet_legs', ascending: true }),
    supabase
      .from('bankrolls')
      .select('currency')
      .eq('user_id', user!.id)
      .eq('is_default', true)
      .single(),
  ])

  const bets: Bet[] = data || []
  const currency = bankroll?.currency || 'USD'
  const metrics = calcSettlementMetrics(bets)
  const totalStaked = bets.reduce((sum, bet) => sum + bet.stake, 0)

  return (
    <main className="bn-page mx-auto flex w-full max-w-6xl flex-col gap-4 pb-8">
      <PageView event={EVENTS.BETS_LIST_VIEWED} props={{ bet_count: bets.length }} />

      <BroadcastPanel className="grid gap-6 p-5 sm:p-7 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div>
          <p className="editorial-kicker">Ставки · сохранённые записи</p>
          <h1 className="mt-3 font-display text-[clamp(2.75rem,8vw,6rem)] font-black leading-none tracking-[-0.06em] text-bn-text">
            Ставки
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-bn-muted">
            Записей: {bets.length} · открыто: {metrics.pendingCount} · рассчитано: {metrics.settledCount}
          </p>
        </div>
        <div className="grid gap-2 min-[420px]:grid-cols-2">
          <Link href="/ai" className="bn-button bn-button-secondary">Скан купона</Link>
          <Link href="/bets/new" className="bn-button bn-button-primary">Добавить</Link>
        </div>
      </BroadcastPanel>

      <SectionGuide
        title="Как вести ставки"
        items={[
          {
            title: 'Храните каждую ставку как запись',
            body: 'Ординар и экспресс отображаются с плечами, коэффициентами и рынками. Это рабочий журнал, а не лента прогнозов.',
          },
          {
            title: 'Закрывайте результат по факту',
            body: 'Открытые ставки можно быстро рассчитать как выигрыш, проигрыш или возврат. P&L появляется только для поддерживаемых закрытых статусов.',
          },
          {
            title: 'Проверяйте экспрессы по плечам',
            body: 'Порядок плеч сохраняется, чтобы можно было сверить купон с исходной линией и не потерять отдельный выбор внутри экспресса.',
          },
        ]}
        note={{
          title: 'Финансовое правило',
          body: 'Возврат не считается прибылью, а неподдерживаемые или частичные статусы не входят в финансовые метрики до ручной проверки.',
        }}
      />

      {bets.length > 0 ? (
        <BroadcastPanel className="grid grid-cols-2 overflow-hidden p-0 md:grid-cols-4">
          <Metric label="Всего поставлено" value={formatMoney(totalStaked, currency)} />
          <Metric label="Win rate" value={metrics.winRate == null ? '—' : `${metrics.winRate.toFixed(0)}%`} />
          <Metric label="ROI" value={metrics.roi == null ? '—' : `${metrics.roi >= 0 ? '+' : ''}${metrics.roi.toFixed(1)}%`} />
          <Metric label="Чистый P&L" value={metrics.settledCount ? formatMoney(metrics.netProfit, currency, true) : '—'} />
        </BroadcastPanel>
      ) : null}

      {bets.length === 0 ? (
        <BroadcastPanel className="grid min-h-72 place-items-center p-6 text-center">
          <div className="max-w-md">
            <BroadcastStatus status="neutral">Пусто · ставок пока нет</BroadcastStatus>
            <h2 className="mt-5 font-display text-3xl font-black tracking-[-0.04em] text-bn-text">Начните с одной точной записи</h2>
            <p className="mt-3 text-sm leading-6 text-bn-muted">
              Отсканируйте купон или внесите ставку вручную. Ничего не сохраняется, пока вы не проверите черновик и не нажмёте сохранение.
            </p>
            <div className="mt-6 grid gap-2 min-[420px]:grid-cols-2">
              <Link href="/ai" className="bn-button bn-button-secondary">Скан купона</Link>
              <Link href="/bets/new" className="bn-button bn-button-primary">Добавить вручную</Link>
            </div>
          </div>
        </BroadcastPanel>
      ) : (
        <BroadcastPanel className="overflow-hidden p-0">
          <div className="flex min-h-14 items-center justify-between gap-4 border-b border-bn-border-strong px-4 py-3 sm:px-6">
            <h2 className="font-display text-xl font-black tracking-[-0.035em] text-bn-text">Сначала новые</h2>
            <span className="font-mono text-[11px] font-bold uppercase tracking-[0.1em] text-bn-quiet">Порядок плеч</span>
          </div>
          <ol aria-label="Сохранённые ставки" className="divide-y divide-bn-border-strong">
            {bets.map((bet) => {
              const legs = bet.legs ?? []
              const resolved = resolveBetStatus(bet.status)
              const totalOdds = bet.total_odds ?? legs[0]?.odds

              return (
                <li key={bet.id}>
                  <Link
                    aria-label={`Открыть ${legs.length > 1 ? `экспресс на ${legs.length} плеч` : legs[0]?.event_name || 'сохранённую ставку'}`}
                    className="grid gap-4 px-4 py-5 transition-colors hover:bg-bn-raised sm:px-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start"
                    href={`/bets/${bet.id}`}
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-[11px] font-black uppercase tracking-[0.1em] text-bn-muted">
                          {legs.length > 1 ? `Экспресс · плеч: ${legs.length}` : 'Одиночная'}
                        </span>
                        <BroadcastStatus status={statusTone(resolved.key)}>{resolved.label}</BroadcastStatus>
                      </div>

                      {legs.length > 0 ? (
                        <ol aria-label="Плечи купона" className="mt-4 space-y-3">
                          {legs.map((leg, index) => (
                            <li className="grid grid-cols-[1.75rem_minmax(0,1fr)_auto] gap-3" key={leg.id}>
                              <span className="font-mono text-[11px] font-bold tabular-nums text-bn-quiet">{String(index + 1).padStart(2, '0')}</span>
                              <span className="min-w-0">
                                <span className="block break-words text-sm font-bold leading-5 text-bn-text">{leg.event_name}</span>
                                <span className="mt-1 block break-words text-xs leading-5 text-bn-muted">
                                  {[leg.market_type, leg.selection].filter(Boolean).join(' · ') || 'Выбор не записан'}
                                </span>
                              </span>
                              <BroadcastDataValue className="text-sm font-black">{leg.odds?.toFixed(2) ?? '—'}</BroadcastDataValue>
                            </li>
                          ))}
                        </ol>
                      ) : (
                        <p className="mt-4 text-sm text-bn-muted">Детали плеч не записаны.</p>
                      )}
                    </div>

                    <dl className="grid grid-cols-3 gap-4 border-t border-bn-border-subtle pt-4 lg:min-w-64 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
                      <DataPoint label="Ставка" value={formatMoney(bet.stake, currency)} />
                      <DataPoint label="Общий кэф" value={totalOdds?.toFixed(2) ?? '—'} />
                      <DataPoint
                        label={isSupportedSettlementStatus(bet.status) ? 'P&L' : 'Записанный P&L'}
                        value={bet.pnl == null || !isSupportedSettlementStatus(bet.status)
                          ? '—'
                          : formatMoney(bet.pnl, currency, true)}
                      />
                      <div className="col-span-3 font-mono text-[11px] text-bn-quiet">
                        <dt className="sr-only">Дата ставки</dt>
                        <dd>{formatDate(bet.placed_at)}</dd>
                      </div>
                    </dl>
                  </Link>
                  {bet.status === 'pending' ? <QuickSettle betId={bet.id} /> : null}
                </li>
              )
            })}
          </ol>
        </BroadcastPanel>
      )}
    </main>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 border-b border-r border-bn-border-subtle p-4 sm:p-5">
      <div className="font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-bn-quiet">{label}</div>
      <BroadcastDataValue className="mt-2 block break-words font-display text-xl font-black tracking-[-0.025em] sm:text-2xl">{value}</BroadcastDataValue>
    </div>
  )
}

function DataPoint({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="font-mono text-[11px] font-bold uppercase tracking-[0.06em] text-bn-quiet">{label}</dt>
      <dd><BroadcastDataValue className="mt-1 block break-words text-sm font-black">{value}</BroadcastDataValue></dd>
    </div>
  )
}

function statusTone(status: BetStatusKey): BroadcastNoirStatus {
  if (status === 'won') return 'success'
  if (status === 'lost') return 'negative'
  if (status === 'pending' || status === 'partial') return 'review'
  return 'neutral'
}


function formatDate(value: string) {
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value))
}
