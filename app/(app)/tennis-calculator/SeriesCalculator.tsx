'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

import {
  BroadcastButton,
  BroadcastDataValue,
  BroadcastPanel,
  BroadcastStatus,
} from '@/components/ui/BroadcastNoir'
import {
  formatMoneyMinor,
  formatOddsScaled,
  parseMoneyMinor,
  parseOddsScaled,
} from '@/lib/tennis/contract'
import {
  actualProfitMinor,
  checkOpenBetLimits,
  checkedAdd,
  fixedOddsPlan,
  fixedOddsPlanForBankroll,
  requiredStakeMinor,
  type FixedOddsPlan,
} from '@/lib/tennis/series-math'
import type {
  TennisSeriesSnapshot,
  TennisStepSnapshot,
} from '@/lib/tennis/ui-contract'

interface SeriesCalculatorProps {
  initialSeries: TennisSeriesSnapshot | null
}

interface CommandResponse {
  success?: boolean
  error?: string
}

type OperationCache = Record<string, { payload: string; id: string }>

const OPEN_STATUSES = new Set(['draft', 'active'])
const FIXED_ODDS_FORMULA = 'v2-fixed-odds:'

type CalculationMode = 'initial_stake' | 'maximum_bank'

interface CreateState {
  calculationMode: CalculationMode
  matchLabel: string
  calculationOdds: string
  initialStake: string
  maximumSteps: string
  bankrollLimit: string
}

const CREATE_INITIAL: CreateState = {
  calculationMode: 'initial_stake',
  matchLabel: '',
  calculationOdds: '3.15',
  initialStake: '20.00',
  maximumSteps: '15',
  bankrollLimit: '5000.00',
}

function commandOperation(
  cache: OperationCache,
  key: string,
  payload: Record<string, unknown>,
): string {
  const serialized = JSON.stringify(payload)
  if (cache[key]?.payload !== serialized) {
    cache[key] = { payload: serialized, id: crypto.randomUUID() }
  }
  return cache[key].id
}

function lostMinor(steps: TennisStepSnapshot[]): bigint {
  return steps
    .filter(step => step.status === 'lost')
    .reduce((sum, step) => sum + parseMoneyMinor(step.accepted_stake), BigInt(0))
}

function signedMoney(minor: bigint): string {
  return `${minor >= BigInt(0) ? '+' : ''}${formatMoneyMinor(minor)}`
}

function parseSignedMoneyMinor(value: string): bigint {
  if (!value.startsWith('-')) return parseMoneyMinor(value)
  return -parseMoneyMinor(value.slice(1))
}

function fixedOddsFormula(odds: string): string {
  return `${FIXED_ODDS_FORMULA}${formatOddsScaled(parseOddsScaled(odds))}`
}

function fixedOddsFromFormula(formulaVersion: string | null | undefined): string {
  if (!formulaVersion?.startsWith(FIXED_ODDS_FORMULA)) return ''
  const value = formulaVersion.slice(FIXED_ODDS_FORMULA.length)
  try {
    return formatOddsScaled(parseOddsScaled(value))
  } catch {
    return ''
  }
}

function buildCreatePlan(create: CreateState): {
  configuredBankMinor: bigint
  plan: FixedOddsPlan
} {
  const games = Number(create.maximumSteps)
  if (!Number.isInteger(games) || games < 1 || games > 15) {
    throw new Error('Количество геймов должно быть целым числом от 1 до 15.')
  }

  const odds = parseOddsScaled(create.calculationOdds)
  if (create.calculationMode === 'initial_stake') {
    const plan = fixedOddsPlan(parseMoneyMinor(create.initialStake), odds, games)
    return { configuredBankMinor: plan.bankrollRequiredMinor, plan }
  }

  const configuredBankMinor = parseMoneyMinor(create.bankrollLimit)
  return {
    configuredBankMinor,
    plan: fixedOddsPlanForBankroll(configuredBankMinor, odds, games),
  }
}

function createPlanError(error: unknown): string {
  if (!(error instanceof Error)) return 'Проверьте введённые значения.'
  if (error.message.includes('odds')) return 'Коэффициент должен быть от 1.01 до 20.00.'
  if (error.message.includes('money') || error.message.includes('stake')) {
    return 'Ставка и банк должны быть больше нуля, максимум с двумя знаками после запятой.'
  }
  if (error.message.includes('bankroll')) {
    return 'Этого банка недостаточно для выбранного коэффициента и количества геймов.'
  }
  return error.message || 'Проверьте введённые значения.'
}

function limitReasonLabel(reason: string): string {
  const labels: Record<string, string> = {
    required_exceeds_remaining_bank: 'рассчитанная ставка превышает остаток банка',
    actual_exceeds_remaining_bank: 'ставка превышает остаток банка',
    required_exceeds_per_bet_limit: 'рассчитанная ставка превышает лимит',
    actual_exceeds_per_bet_limit: 'ставка превышает лимит',
    required_exceeds_series_exposure: 'серия превышает максимальный банк',
    actual_exceeds_series_exposure: 'серия превышает максимальный банк',
  }
  return labels[reason] ?? 'проверьте параметры серии'
}

function statusLabel(status: TennisSeriesSnapshot['status']): string {
  const labels: Record<TennisSeriesSnapshot['status'], string> = {
    draft: 'Готова',
    active: 'Активна',
    completed_win: 'Выигрыш · завершена',
    stopped: 'Остановлена',
    limit_reached: 'Лимит достигнут',
    cancelled: 'Отменена',
  }
  return labels[status]
}

export function SeriesCalculator({ initialSeries }: SeriesCalculatorProps) {
  const router = useRouter()
  const inFlight = useRef(false)
  const operations = useRef<OperationCache>({})

  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [showCreate, setShowCreate] = useState(initialSeries === null)
  const [create, setCreate] = useState(CREATE_INITIAL)

  const configuredOdds = fixedOddsFromFormula(initialSeries?.formula_version)
  const [quotedOdds, setQuotedOdds] = useState(configuredOdds)

  const [settlement, setSettlement] = useState<'won' | 'lost' | 'void' | ''>('')
  const [stopArmed, setStopArmed] = useState(false)

  async function submitCommand(
    key: string,
    path: string,
    payload: Record<string, unknown>,
  ) {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true)
    setMessage('')

    const operationId = commandOperation(operations.current, key, payload)
    try {
      const response = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, operation_id: operationId }),
      })
      const body = await response.json() as CommandResponse
      if (!response.ok || !body.success) {
        setMessage(response.status === 409
          ? 'State changed in another tab. Refreshing server truth.'
          : body.error ?? 'Command rejected')
        if (response.status === 409) router.refresh()
        return
      }

      delete operations.current[key]
      router.refresh()
    } catch {
      setMessage('Network error. Retry will reuse the same operation id.')
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }

  async function createSeries() {
    let preview: ReturnType<typeof buildCreatePlan>
    try {
      preview = buildCreatePlan(create)
    } catch (error) {
      setMessage(createPlanError(error))
      return
    }

    await submitCommand('create', '/api/tennis/series/create', {
      target_profit: formatMoneyMinor(preview.plan.targetProfitMinor),
      initial_stake: formatMoneyMinor(preview.plan.initialStakeMinor),
      stake_increment: '0.01',
      currency_or_unit: 'USD',
      bankroll_limit: formatMoneyMinor(preview.configuredBankMinor),
      maximum_stake: null,
      maximum_steps: Number(create.maximumSteps),
      exposure_limit: formatMoneyMinor(preview.configuredBankMinor),
      formula_version: fixedOddsFormula(create.calculationOdds),
      match_label: create.matchLabel.trim() || null,
    })
  }

  const series = initialSeries
  const isOpen = series ? OPEN_STATUSES.has(series.status) : false
  const pendingStep = series?.steps.find(step => step.status === 'confirmed') ?? null
  const loss = series ? lostMinor(series.steps) : BigInt(0)

  let recommendation: string | null = null
  let projected: string | null = null
  let blockReason: string | null = null
  if (series && isOpen && !pendingStep && quotedOdds) {
    try {
      const recommendedMinor = series.steps.length === 0 && series.initial_stake
        ? parseMoneyMinor(series.initial_stake)
        : requiredStakeMinor(
            loss,
            parseMoneyMinor(series.target_profit),
            parseOddsScaled(quotedOdds),
            parseMoneyMinor(series.stake_increment),
          )
      recommendation = formatMoneyMinor(recommendedMinor)

      const actualStakeMinor = recommendedMinor
      const remainingBank = parseMoneyMinor(series.bankroll_limit) - loss
      if (remainingBank < BigInt(0)) {
        blockReason = 'текущий минус превышает максимальный банк'
      } else {
        const limit = checkOpenBetLimits({
          requiredStakeMinor: recommendedMinor,
          actualStakeMinor,
          lMinor: loss,
          remainingBankMinor: remainingBank,
          perBetLimitMinor: series.maximum_stake
            ? parseMoneyMinor(series.maximum_stake)
            : parseMoneyMinor(series.bankroll_limit),
          seriesExposureLimitMinor: parseMoneyMinor(series.exposure_limit),
        })
        if (!limit.ok) blockReason = limitReasonLabel(limit.reason)
      }

      projected = signedMoney(actualProfitMinor(
        actualStakeMinor,
        parseOddsScaled(quotedOdds),
        loss,
      ))
    } catch {
      recommendation = null
      projected = null
    }
  }

  async function confirmStep() {
    if (!series || !recommendation || blockReason) {
      setMessage(blockReason ? `Лимит: ${blockReason}.` : 'Введите корректный коэффициент.')
      return
    }
    await submitCommand('confirm', '/api/tennis/series/confirm', {
      series_id: series.id,
      expected_version: series.version,
      set_number: null,
      game_number: null,
      quoted_odds: quotedOdds,
      accepted_odds: quotedOdds,
      accepted_stake: recommendation,
    })
  }

  async function settleStep() {
    if (!series || !pendingStep || !settlement) {
      setMessage('Выберите результат: выигрыш, проигрыш или возврат.')
      return
    }

    let winReturn: string | null = null
    try {
      const stakeMinor = parseMoneyMinor(pendingStep.accepted_stake)
      winReturn = settlement === 'won'
        ? formatMoneyMinor(checkedAdd(
            stakeMinor,
            actualProfitMinor(stakeMinor, parseOddsScaled(pendingStep.accepted_odds), BigInt(0)),
          ))
        : null
    } catch {
      setMessage('Не удалось рассчитать выплату. Обновите страницу и попробуйте ещё раз.')
      return
    }

    await submitCommand('settle', '/api/tennis/series/settle', {
      series_id: series.id,
      step_id: pendingStep.id,
      expected_version: series.version,
      result: settlement,
      actual_return: winReturn,
    })
  }

  async function stopSeries() {
    if (!series) return
    await submitCommand('stop', '/api/tennis/series/stop', {
      series_id: series.id,
      expected_version: series.version,
    })
  }

  let createPreview: ReturnType<typeof buildCreatePlan> | null = null
  try {
    createPreview = buildCreatePlan(create)
  } catch {
    createPreview = null
  }

  if (!series || showCreate) {
    const displayedInitialStake = create.calculationMode === 'initial_stake'
      ? create.initialStake
      : createPreview
        ? formatMoneyMinor(createPreview.plan.initialStakeMinor)
        : ''
    const displayedMaximumBank = create.calculationMode === 'maximum_bank'
      ? create.bankrollLimit
      : createPreview
        ? formatMoneyMinor(createPreview.configuredBankMinor)
        : ''

    return (
      <div className="flex flex-col gap-4">
        <BroadcastPanel className="p-4 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="editorial-kicker">Новая серия</p>
              <h2 className="mt-2 font-display text-3xl font-black tracking-[-0.045em] text-bn-text">
                Параметры расчёта
              </h2>
            </div>
            {series ? (
              <BroadcastButton tone="secondary" onClick={() => setShowCreate(false)}>
                Назад
              </BroadcastButton>
            ) : null}
          </div>

          <div className="mt-6 grid grid-cols-2 overflow-hidden rounded-control border border-bn-border-strong">
            <button
              type="button"
              aria-pressed={create.calculationMode === 'initial_stake'}
              className={`min-h-12 border-r border-bn-border-strong px-3 text-sm font-black transition-colors ${
                create.calculationMode === 'initial_stake'
                  ? 'bg-bn-signal text-bn-on-signal'
                  : 'bg-bn-field text-bn-muted hover:bg-bn-raised hover:text-bn-text'
              }`}
              onClick={() => {
                setCreate(value => ({ ...value, calculationMode: 'initial_stake' }))
                setMessage('')
              }}
            >
              От начальной ставки
            </button>
            <button
              type="button"
              aria-pressed={create.calculationMode === 'maximum_bank'}
              className={`min-h-12 px-3 text-sm font-black transition-colors ${
                create.calculationMode === 'maximum_bank'
                  ? 'bg-bn-signal text-bn-on-signal'
                  : 'bg-bn-field text-bn-muted hover:bg-bn-raised hover:text-bn-text'
              }`}
              onClick={() => {
                setCreate(value => ({ ...value, calculationMode: 'maximum_bank' }))
                setMessage('')
              }}
            >
              От максимального банка
            </button>
          </div>
          <p className="mt-3 text-xs leading-5 text-bn-muted">
            {create.calculationMode === 'initial_stake'
              ? 'Введите начальную ставку — необходимый банк рассчитается автоматически.'
              : 'Введите максимальный банк — начальная ставка рассчитается автоматически.'}
          </p>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <label className="sm:col-span-2">
              <span className="label">Название матча · необязательно</span>
              <input
                className="input"
                maxLength={200}
                value={create.matchLabel}
                onChange={event => {
                  setCreate(value => ({ ...value, matchLabel: event.target.value }))
                  setMessage('')
                }}
                placeholder="Кто против кого"
              />
            </label>
            <label>
              <span className="label">Коэффициент для расчёта</span>
              <input
                className="input font-mono"
                inputMode="decimal"
                min="1.01"
                max="20"
                step="0.001"
                value={create.calculationOdds}
                onChange={event => {
                  setCreate(value => ({ ...value, calculationOdds: event.target.value }))
                  setMessage('')
                }}
                placeholder="3.15"
              />
            </label>
            <label>
              <span className="label">Количество геймов</span>
              <input
                className="input font-mono"
                inputMode="numeric"
                min="1"
                max="15"
                step="1"
                value={create.maximumSteps}
                onChange={event => {
                  setCreate(value => ({ ...value, maximumSteps: event.target.value }))
                  setMessage('')
                }}
                placeholder="15"
              />
            </label>
            <label>
              <span className="label">
                Начальная ставка
                {create.calculationMode === 'maximum_bank' ? ' · рассчитана' : ''}
              </span>
              <input
                className={`input font-mono ${create.calculationMode === 'maximum_bank' ? 'cursor-default bg-bn-night text-bn-data' : ''}`}
                inputMode="decimal"
                min="0.01"
                step="0.01"
                readOnly={create.calculationMode === 'maximum_bank'}
                aria-readonly={create.calculationMode === 'maximum_bank'}
                value={displayedInitialStake}
                onChange={event => {
                  setCreate(value => ({ ...value, initialStake: event.target.value }))
                  setMessage('')
                }}
                placeholder={create.calculationMode === 'maximum_bank' ? 'Рассчитается автоматически' : '20.00'}
              />
            </label>
            <label>
              <span className="label">
                Максимальный банк
                {create.calculationMode === 'initial_stake' ? ' · рассчитан' : ''}
              </span>
              <input
                className={`input font-mono ${create.calculationMode === 'initial_stake' ? 'cursor-default bg-bn-night text-bn-data' : ''}`}
                inputMode="decimal"
                min="0.01"
                step="0.01"
                readOnly={create.calculationMode === 'initial_stake'}
                aria-readonly={create.calculationMode === 'initial_stake'}
                value={displayedMaximumBank}
                onChange={event => {
                  setCreate(value => ({ ...value, bankrollLimit: event.target.value }))
                  setMessage('')
                }}
                placeholder={create.calculationMode === 'initial_stake' ? 'Рассчитается автоматически' : '5000.00'}
              />
            </label>
          </div>

          <div className="mt-5 grid grid-cols-2 overflow-hidden rounded-control border border-bn-border-subtle">
            <div className="border-r border-bn-border-subtle p-4">
              <span className="stat-label">Прибыль при победе</span>
              <BroadcastDataValue className="mt-2 block text-xl font-black">
                {createPreview ? formatMoneyMinor(createPreview.plan.targetProfitMinor) : '—'}
              </BroadcastDataValue>
            </div>
            <div className="p-4">
              <span className="stat-label">Последняя ставка</span>
              <BroadcastDataValue className="mt-2 block text-xl font-black">
                {createPreview
                  ? formatMoneyMinor(createPreview.plan.stakesMinor[createPreview.plan.stakesMinor.length - 1])
                  : '—'}
              </BroadcastDataValue>
            </div>
          </div>

          <p className="mt-4 text-xs leading-5 text-bn-muted">
            Расчёт размера ставок не повышает вероятность выигрыша. При серии проигрышей можно потерять весь выбранный банк.
          </p>
        </BroadcastPanel>

        {message ? (
          <div role="alert" aria-live="assertive">
            <BroadcastStatus status="negative">{message}</BroadcastStatus>
          </div>
        ) : null}
        <BroadcastButton className="min-h-12" disabled={busy} onClick={createSeries}>
          {busy ? 'Создаём…' : 'Начать серию'}
        </BroadcastButton>
      </div>
    )
  }

  const remaining = parseMoneyMinor(series.bankroll_limit) - loss
  const latestWon = [...series.steps].reverse().find(step => step.status === 'won')
  const realized = latestWon?.actual_return
    ? parseMoneyMinor(latestWon.actual_return)
      - parseMoneyMinor(latestWon.accepted_stake)
      - parseMoneyMinor(latestWon.loss_before)
    : null

  return (
    <div className="flex flex-col gap-4">
      <BroadcastPanel className="overflow-hidden p-0">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-bn-border-strong p-4 sm:p-5">
          <div>
            <p className="editorial-kicker">Текущая серия</p>
            <h2 className="mt-2 break-words font-display text-2xl font-black tracking-[-0.04em] text-bn-text">
              {series.match_label || 'Без названия'}
            </h2>
          </div>
          <BroadcastStatus status={isOpen ? 'review' : series.status === 'completed_win' ? 'success' : 'neutral'}>
            {statusLabel(series.status)}
          </BroadcastStatus>
        </div>
        <dl className="grid grid-cols-2 sm:grid-cols-4">
          <div className="border-b border-r border-bn-border-subtle p-4">
            <dt className="stat-label">Гейм</dt>
            <dd><BroadcastDataValue className="mt-2 block font-display text-2xl font-black">{series.steps.length}/{series.maximum_steps}</BroadcastDataValue></dd>
          </div>
          <div className="border-b border-r border-bn-border-subtle p-4">
            <dt className="stat-label">Текущий минус</dt>
            <dd><BroadcastDataValue className="mt-2 block font-display text-2xl font-black">{formatMoneyMinor(loss)}</BroadcastDataValue></dd>
          </div>
          <div className="border-b border-r border-bn-border-subtle p-4">
            <dt className="stat-label">Прибыль при победе</dt>
            <dd><BroadcastDataValue className="mt-2 block font-display text-2xl font-black">{series.target_profit}</BroadcastDataValue></dd>
          </div>
          <div className="border-b border-bn-border-subtle p-4">
            <dt className="stat-label">Остаток банка</dt>
            <dd><BroadcastDataValue className="mt-2 block font-display text-2xl font-black">{formatMoneyMinor(remaining)}</BroadcastDataValue></dd>
          </div>
        </dl>
      </BroadcastPanel>

      {!isOpen ? (
        <BroadcastPanel className="p-5 text-center sm:p-7">
          <BroadcastStatus status={series.status === 'completed_win' ? 'success' : 'neutral'}>
            Серия завершена
          </BroadcastStatus>
          <h3 className="mt-5 font-display text-3xl font-black tracking-[-0.04em] text-bn-text">
            {realized === null ? 'Результат сохранён' : `${signedMoney(realized)} ${series.currency_or_unit}`}
          </h3>
          <p className="mt-3 text-xs leading-5 text-bn-muted">
            Это фактический результат завершённой серии.
          </p>
          <BroadcastButton className="mt-6 min-h-12 w-full" onClick={() => setShowCreate(true)}>
            Начать новую серию
          </BroadcastButton>
        </BroadcastPanel>
      ) : pendingStep ? (
        <BroadcastPanel className="p-4 sm:p-6">
          <p className="editorial-kicker">Результат гейма {pendingStep.step_number}</p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div>
              <span className="stat-label">Ставка</span>
              <BroadcastDataValue className="mt-1 block text-xl font-black">
                {pendingStep.accepted_stake} @ {pendingStep.accepted_odds}
              </BroadcastDataValue>
            </div>
            <div>
              <span className="stat-label">Итог при выигрыше</span>
              <BroadcastDataValue className="mt-1 block text-xl font-black">
                {signedMoney(parseSignedMoneyMinor(pendingStep.projected_series_result))}
              </BroadcastDataValue>
            </div>
          </div>

          <fieldset className="mt-6">
            <legend className="label">Чем закончился гейм?</legend>
            <div className="grid grid-cols-3 gap-2">
              {(['won', 'lost', 'void'] as const).map(result => (
                <BroadcastButton
                  key={result}
                  className="min-h-12"
                  tone={settlement === result ? 'primary' : 'secondary'}
                  aria-pressed={settlement === result}
                  onClick={() => setSettlement(result)}
                >
                  {result === 'won' ? 'Выигрыш' : result === 'lost' ? 'Проигрыш' : 'Возврат'}
                </BroadcastButton>
              ))}
            </div>
          </fieldset>

          {message ? (
            <div className="mt-4" role="alert" aria-live="assertive">
              <BroadcastStatus status="negative">{message}</BroadcastStatus>
            </div>
          ) : null}
          <BroadcastButton className="mt-5 min-h-12 w-full" disabled={busy} onClick={settleStep}>
            {busy ? 'Сохраняем…' : 'Сохранить результат'}
          </BroadcastButton>
        </BroadcastPanel>
      ) : (
        <BroadcastPanel className="p-4 sm:p-6">
          <p className="editorial-kicker">Следующий гейм · {series.steps.length + 1} из {series.maximum_steps}</p>

          {!configuredOdds ? (
            <label className="mt-5 block">
              <span className="label">Коэффициент для расчёта</span>
              <input
                className="input min-h-12 font-mono"
                inputMode="decimal"
                value={quotedOdds}
                onChange={event => setQuotedOdds(event.target.value)}
                placeholder="3.15"
              />
            </label>
          ) : null}

          <div className="mt-5 grid grid-cols-1 overflow-hidden rounded-[var(--radius-control)] border border-bn-border-strong min-[420px]:grid-cols-3">
            <div className="border-b border-bn-border-subtle p-4 min-[420px]:border-b-0 min-[420px]:border-r">
              <span className="stat-label">Коэффициент</span>
              <BroadcastDataValue className="mt-2 block font-display text-2xl font-black">
                {quotedOdds || '—'}
              </BroadcastDataValue>
            </div>
            <div className="border-b border-bn-border-subtle p-4 min-[420px]:border-b-0 min-[420px]:border-r">
              <span className="stat-label">Ставка</span>
              <BroadcastDataValue className="mt-2 block font-display text-3xl font-black">
                {recommendation ?? '—'}
              </BroadcastDataValue>
            </div>
            <div className="p-4">
              <span className="stat-label">Итог при выигрыше</span>
              <BroadcastDataValue className="mt-2 block font-display text-2xl font-black">
                {projected ?? '—'}
              </BroadcastDataValue>
            </div>
          </div>

          {blockReason ? (
            <div className="mt-4" role="alert" aria-live="polite">
              <BroadcastStatus status="negative">Лимит · {blockReason}</BroadcastStatus>
            </div>
          ) : null}
          {message ? (
            <div className="mt-4" role="alert" aria-live="assertive">
              <BroadcastStatus status="negative">{message}</BroadcastStatus>
            </div>
          ) : null}

          <BroadcastButton
            className="mt-5 min-h-12 w-full"
            disabled={busy || !recommendation || Boolean(blockReason)}
            onClick={confirmStep}
          >
            {busy ? 'Подтверждаем…' : `Подтвердить ставку ${recommendation ?? ''}`}
          </BroadcastButton>
          <p className="mt-3 text-center text-[11px] leading-5 text-bn-quiet">
            Сервер повторно проверит сумму перед сохранением.
          </p>
        </BroadcastPanel>
      )}

      {series.steps.length > 0 ? (
        <BroadcastPanel className="overflow-hidden p-0">
          <div className="border-b border-bn-border-strong p-4">
            <p className="editorial-kicker">История серии</p>
          </div>
          <ol className="divide-y divide-bn-border-subtle">
            {series.steps.map(step => (
              <li key={step.id} className="grid grid-cols-[2rem_minmax(0,1fr)_auto] gap-3 p-4">
                <span className="font-mono text-[11px] font-black text-bn-quiet">
                  {String(step.step_number).padStart(2, '0')}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-bold text-bn-text">
                    {step.accepted_stake} @ {step.accepted_odds}
                  </span>
                  <span className="mt-1 block text-[11px] text-bn-muted">
                    Итог при выигрыше {signedMoney(parseSignedMoneyMinor(step.projected_series_result))}
                  </span>
                </span>
                <BroadcastStatus status={step.status === 'won' ? 'success' : step.status === 'lost' ? 'negative' : step.status === 'confirmed' ? 'review' : 'neutral'}>
                  {step.status === 'won'
                    ? 'Выигрыш'
                    : step.status === 'lost'
                      ? 'Проигрыш'
                      : step.status === 'void'
                        ? 'Возврат'
                        : 'Ожидает'}
                </BroadcastStatus>
              </li>
            ))}
          </ol>
        </BroadcastPanel>
      ) : null}

      {isOpen && !pendingStep ? (
        stopArmed ? (
          <BroadcastPanel className="p-4">
            <p className="text-xs leading-5 text-bn-muted">
              После остановки продолжить эту серию будет нельзя.
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <BroadcastButton
                tone="secondary"
                disabled={busy}
                onClick={() => setStopArmed(false)}
              >
                Продолжить серию
              </BroadcastButton>
              <BroadcastButton tone="destructive" disabled={busy} onClick={stopSeries}>
                {busy ? 'Останавливаем…' : 'Остановить'}
              </BroadcastButton>
            </div>
          </BroadcastPanel>
        ) : (
          <BroadcastButton tone="destructive" disabled={busy} onClick={() => setStopArmed(true)}>
            Остановить серию
          </BroadcastButton>
        )
      ) : null}
    </div>
  )
}
