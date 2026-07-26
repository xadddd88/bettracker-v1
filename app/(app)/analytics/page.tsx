import Link from 'next/link'

import BetaNote from '@/components/ui/BetaNote'
import {
  BroadcastDataValue,
  BroadcastPanel,
  BroadcastStatus,
} from '@/components/ui/BroadcastNoir'
import SectionGuide from '@/components/ui/SectionGuide'
import { calcPerformance } from '@/lib/analytics/performance'
import { EVENTS } from '@/lib/analytics/events'
import { PageView } from '@/lib/analytics/PageView'
import { fmtPct, formatMoney } from '@/lib/money'
import { createClient } from '@/lib/supabase/server'
import type { BroadcastNoirStatus } from '@/lib/ui/broadcast-noir'
import type { Bet } from '@/types'

const SPORT_LABEL: Record<string, string> = {
  basketball: 'Баскетбол',
  cs2: 'CS2',
  ice_hockey: 'Хоккей',
  mma: 'MMA',
  mixed: 'Микс',
  other: 'Другое',
  soccer: 'Футбол',
  tennis: 'Теннис',
}

const SOURCE_LABEL: Record<string, string> = {
  ai_analyst: 'AI Analyst',
  import: 'Импорт',
  manual: 'Вручную',
  quick_entry: 'Быстрый ввод',
  scanner: 'Сканер',
}

const DECISION_ACTIONS = [
  { key: 'placed', label: 'Поставлено', tone: 'success' },
  { key: 'watchlisted', label: 'В наблюдении', tone: 'review' },
  { key: 'pending', label: 'Ожидает', tone: 'review' },
  { key: 'skipped', label: 'Пропущено', tone: 'neutral' },
  { key: 'ignored', label: 'Игнорировано', tone: 'neutral' },
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
        <p className="editorial-kicker">Статистика · записанные исходы</p>
        <h1 className="mt-3 font-display text-[clamp(2.75rem,8vw,6rem)] font-black leading-none tracking-[-0.06em] text-bn-text">Результаты</h1>
        <p className="mt-4 max-w-2xl text-sm leading-6 text-bn-muted">
          Ставок: {bets.length} · рассчитано: {metrics.settledCount} · решений: {decisions.length}
        </p>
      </BroadcastPanel>

      <SectionGuide
        title="Как читать статистику"
        items={[
          {
            title: 'Смотрите только рассчитанные исходы',
            body: 'P&L, ROI и Win rate строятся из закрытых ставок. Открытые ставки показывают риск, но не меняют итоговую прибыль.',
          },
          {
            title: 'Разделяйте источник и спорт',
            body: 'Таблицы по спорту и источнику помогают увидеть, где решения работают лучше, а где выборка ещё слишком маленькая.',
          },
          {
            title: 'Следите за конверсией решений',
            body: 'Блок решений показывает, какие анализы были поставлены, пропущены или оставлены в наблюдении. Это помогает проверять дисциплину.',
          },
        ]}
        note={{
          title: 'Почему нет демо-графиков',
          body: 'Если данных нет, статистика остаётся пустой. Раздел не рисует красивые числа без сохранённых ставок и решений.',
        }}
      />

      {bets.length === 0 && decisions.length === 0 ? (
        <BroadcastPanel className="grid min-h-72 place-items-center p-6 text-center">
          <div className="max-w-md">
            <BroadcastStatus status="neutral">Пусто · записей пока нет</BroadcastStatus>
            <h2 className="mt-5 font-display text-3xl font-black tracking-[-0.04em] text-bn-text">Пока нечего считать</h2>
            <p className="mt-3 text-sm leading-6 text-bn-muted">Статистика появится только после сохранённой ставки или решения. Демо-графики и выдуманные результаты не показываются.</p>
            <div className="mt-6 grid gap-2 min-[420px]:grid-cols-2">
              <Link className="bn-button bn-button-secondary" href="/ai">Проанализировать</Link>
              <Link className="bn-button bn-button-primary" href="/bets/new">Добавить ставку</Link>
            </div>
          </div>
        </BroadcastPanel>
      ) : (
        <>
          {metrics.settledCount > 0 && metrics.settledCount < 10 ? (
            <BetaNote>Метрики становятся надёжнее, когда рассчитанных ставок больше. Текущая выборка: {metrics.settledCount}.</BetaNote>
          ) : null}

          {metrics.unsupportedCount + metrics.unknownCount > 0 ? (
            <BroadcastPanel className="p-4">
              <BroadcastStatus status="review">
                Статусы вне финансовой модели: {metrics.unsupportedCount + metrics.unknownCount}. Они исключены из расчётов прибыли.
              </BroadcastStatus>
            </BroadcastPanel>
          ) : null}

          <section aria-label="Метрики результата" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Metric label="Чистый P&L" note="Только рассчитанные" value={metrics.settledCount ? formatMoney(metrics.netProfit, currency, true) : '—'} />
            <Metric label="ROI" note="Возвраты исключены" value={metrics.roi == null ? '—' : fmtPct(metrics.roi)} />
            <Metric label="Win rate" note="Выиграла / выиграла + проиграла" value={metrics.winRate == null ? '—' : `${metrics.winRate.toFixed(1)}%`} />
            <Metric label="Рассчитано" note={`${metrics.wonCount}W · ${metrics.lostCount}L · ${metrics.voidCount}V`} value={String(metrics.settledCount)} />
            <Metric label="Открытый риск" note={`Открыто: ${metrics.pendingCount}`} value={metrics.pendingCount ? formatMoney(metrics.pendingStake, currency) : '—'} />
            <Metric label="Решения" note="Сохранённые записи" value={String(metrics.totalDecisions)} />
            <Metric label="Решение → ставка" note={`Поставлено: ${metrics.decisionsByAction.placed}`} value={metrics.conversionRate == null ? '—' : `${metrics.conversionRate.toFixed(1)}%`} />
            <Metric label="Средний кэф" note="Только won/lost" value={metrics.avgOdds == null ? '—' : metrics.avgOdds.toFixed(2)} />
          </section>

          <BroadcastPanel className="p-5 sm:p-7">
            <SectionHeader detail={`Всего: ${bets.length}`} title="Исходы" />
            <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Outcome count={metrics.wonCount} currency={currency} label="Выиграла" stake={stakeFor(bets, 'won')} status="success" />
              <Outcome count={metrics.lostCount} currency={currency} label="Проиграла" stake={stakeFor(bets, 'lost')} status="negative" />
              <Outcome count={metrics.voidCount} currency={currency} label="Возврат" stake={stakeFor(bets, 'void')} status="neutral" />
              <Outcome count={metrics.pendingCount} currency={currency} label="Открыта" stake={metrics.pendingStake} status="review" />
            </div>
          </BroadcastPanel>

          <BroadcastPanel className="p-5 sm:p-7">
            <SectionHeader detail={`Всего: ${decisions.length}`} title="Действия по решениям" />
            {decisions.length === 0 ? (
              <EmptyLine><Link className="underline underline-offset-4" href="/ai">Запустите анализ</Link>, чтобы создать первое решение.</EmptyLine>
            ) : (
              <dl className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                {DECISION_ACTIONS.map((action) => {
                  const count = metrics.decisionsByAction[action.key] ?? 0
                  const percent = decisions.length ? (count / decisions.length) * 100 : 0
                  return (
                    <div className="rounded-control border border-bn-border-subtle p-3" key={action.key}>
                      <BroadcastStatus status={action.tone}>{action.label}</BroadcastStatus>
                      <dd><BroadcastDataValue className="mt-3 block text-2xl font-black">{count}</BroadcastDataValue></dd>
                      <dt className="mt-1 text-xs text-bn-muted">{percent.toFixed(0)}% решений</dt>
                    </div>
                  )
                })}
              </dl>
            )}
          </BroadcastPanel>

          <PerformanceTable currency={currency} rows={metrics.bySport.map((row) => ({ ...row, label: SPORT_LABEL[row.sport] ?? row.sport }))} title="По спорту" />
          <PerformanceTable currency={currency} rows={metrics.bySource.map((row) => ({ ...row, label: SOURCE_LABEL[row.source] ?? row.source }))} title="По источнику" />

          <BroadcastPanel className="p-5 sm:p-7">
            <SectionHeader detail="Источник = AI Analyst" title="Записи AI Analyst" />
            {metrics.aiAnalyst.total === 0 ? (
              <EmptyLine>Ставок из AI Analyst пока нет.</EmptyLine>
            ) : (
              <dl className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
                <SmallMetric label="Ставки" value={String(metrics.aiAnalyst.total)} />
                <SmallMetric label="Win rate" value={metrics.aiAnalyst.winRate == null ? '—' : `${metrics.aiAnalyst.winRate.toFixed(1)}%`} />
                <SmallMetric label="ROI" value={metrics.aiAnalyst.roi == null ? '—' : fmtPct(metrics.aiAnalyst.roi)} />
                <SmallMetric label="Чистый P&L" value={metrics.aiAnalyst.won + metrics.aiAnalyst.lost ? formatMoney(metrics.aiAnalyst.netProfit, currency, true) : '—'} />
              </dl>
            )}
          </BroadcastPanel>

          <BroadcastPanel className="overflow-hidden p-0">
            <div className="px-5 py-4 sm:px-7"><SectionHeader detail={`Риск: ${formatMoney(metrics.pendingStake, currency)}`} title="Открытые ставки" /></div>
            {pendingBets.length === 0 ? <EmptyLine>Открытых ставок нет.</EmptyLine> : (
              <ol className="divide-y divide-bn-border-strong">
                {pendingBets.map((bet) => (
                  <li key={bet.id}>
                    <Link className="grid gap-2 px-5 py-4 transition-colors hover:bg-bn-raised sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-7" href={`/bets/${bet.id}`}>
                      <div className="min-w-0">
                        <div className="break-words text-sm font-bold text-bn-text">{bet.legs?.[0]?.event_name || 'Сохранённая ставка'}</div>
                        <div className="mt-1 text-xs text-bn-muted">Плеч: {bet.legs?.length || 0} · сохранено {formatDate(bet.placed_at)}</div>
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
      <div className="mt-1 text-xs text-bn-muted">Сумма ставок: {formatMoney(stake, currency)}</div>
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
      <div className="px-5 py-4 sm:px-7"><SectionHeader detail="Точные значения" title={title} /></div>
      {rows.length === 0 ? <EmptyLine>Сохранённых ставок нет.</EmptyLine> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] border-collapse text-sm">
            <caption className="sr-only">{title} performance calculated from saved bets</caption>
            <thead>
              <tr className="border-y border-bn-border-strong text-left">
                {['Группа', 'Ставки', 'W / L / V', 'Win rate', 'ROI', 'P&L'].map((label, index) => (
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
  return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value))
}
