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
  parseMoneyMinor,
  parseOddsScaled,
} from '@/lib/tennis/contract'
import {
  actualProfitMinor,
  checkOpenBetLimits,
  requiredStakeMinor,
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

const CREATE_INITIAL = {
  matchLabel: '',
  targetProfit: '',
  initialStake: '20.00',
  stakeIncrement: '0.01',
  currencyOrUnit: 'USD',
  bankrollLimit: '',
  maximumStake: '',
  maximumSteps: '15',
  exposureLimit: '',
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

function statusLabel(status: TennisSeriesSnapshot['status']): string {
  const labels: Record<TennisSeriesSnapshot['status'], string> = {
    draft: 'Draft',
    active: 'Active',
    completed_win: 'Won · closed',
    stopped: 'Stopped',
    limit_reached: 'Limit reached',
    cancelled: 'Cancelled',
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
  const [riskAccepted, setRiskAccepted] = useState(false)
  const [create, setCreate] = useState(CREATE_INITIAL)

  const [quotedOdds, setQuotedOdds] = useState('')
  const [acceptedOdds, setAcceptedOdds] = useState('')
  const [acceptedStake, setAcceptedStake] = useState('')
  const [setNumber, setSetNumber] = useState('')
  const [gameNumber, setGameNumber] = useState('')

  const [settlement, setSettlement] = useState<'won' | 'lost' | 'void' | ''>('')
  const [actualReturn, setActualReturn] = useState('')
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
    if (!riskAccepted) {
      setMessage('Confirm the training risk notice first.')
      return
    }

    const maximumSteps = Number(create.maximumSteps)
    if (!Number.isInteger(maximumSteps)) {
      setMessage('Maximum steps must be a whole number.')
      return
    }

    await submitCommand('create', '/api/tennis/series/create', {
      target_profit: create.targetProfit,
      initial_stake: create.initialStake || null,
      stake_increment: create.stakeIncrement,
      currency_or_unit: create.currencyOrUnit,
      bankroll_limit: create.bankrollLimit,
      maximum_stake: create.maximumStake || null,
      maximum_steps: maximumSteps,
      exposure_limit: create.exposureLimit,
      formula_version: 'v1',
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

      const actualStakeMinor = parseMoneyMinor(acceptedStake || recommendation)
      const remainingBank = parseMoneyMinor(series.bankroll_limit) - loss
      if (remainingBank < BigInt(0)) {
        blockReason = 'Recorded loss exceeds the isolated series bank.'
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
        if (!limit.ok) blockReason = limit.reason.replaceAll('_', ' ')
      }

      projected = signedMoney(actualProfitMinor(
        actualStakeMinor,
        parseOddsScaled(acceptedOdds || quotedOdds),
        loss,
      ))
    } catch {
      recommendation = null
      projected = null
    }
  }

  async function confirmStep() {
    if (!series || !recommendation || blockReason) {
      setMessage(blockReason ? 'BLOCKED by the configured series limits.' : 'Enter valid odds and stake.')
      return
    }
    await submitCommand('confirm', '/api/tennis/series/confirm', {
      series_id: series.id,
      expected_version: series.version,
      set_number: setNumber ? Number(setNumber) : null,
      game_number: gameNumber ? Number(gameNumber) : null,
      quoted_odds: quotedOdds,
      accepted_odds: acceptedOdds || quotedOdds,
      accepted_stake: acceptedStake || recommendation,
    })
  }

  async function settleStep() {
    if (!series || !pendingStep || !settlement) {
      setMessage('Choose Win, Loss, or Void.')
      return
    }
    if (settlement === 'won' && !actualReturn) {
      setMessage('Enter the actual total return for a win.')
      return
    }
    await submitCommand('settle', '/api/tennis/series/settle', {
      series_id: series.id,
      step_id: pendingStep.id,
      expected_version: series.version,
      result: settlement,
      actual_return: settlement === 'won' ? actualReturn : null,
    })
  }

  async function stopSeries() {
    if (!series) return
    await submitCommand('stop', '/api/tennis/series/stop', {
      series_id: series.id,
      expected_version: series.version,
    })
  }

  if (!series || showCreate) {
    return (
      <div className="flex flex-col gap-4">
        <BroadcastPanel className="p-4 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="editorial-kicker">01 · isolated configuration</p>
              <h2 className="mt-2 font-display text-3xl font-black tracking-[-0.045em] text-bn-text">
                New series
              </h2>
            </div>
            {series ? (
              <BroadcastButton tone="secondary" onClick={() => setShowCreate(false)}>
                Back
              </BroadcastButton>
            ) : null}
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <label className="sm:col-span-2">
              <span className="label">Match label · optional</span>
              <input
                className="input"
                maxLength={200}
                value={create.matchLabel}
                onChange={event => setCreate(value => ({ ...value, matchLabel: event.target.value }))}
                placeholder="Player A vs Player B"
              />
            </label>
            <label>
              <span className="label">Target series profit</span>
              <input
                className="input font-mono"
                inputMode="decimal"
                value={create.targetProfit}
                onChange={event => setCreate(value => ({ ...value, targetProfit: event.target.value }))}
                placeholder="5.00"
              />
            </label>
            <label>
              <span className="label">Game 1 stake · optional</span>
              <input
                className="input font-mono"
                inputMode="decimal"
                value={create.initialStake}
                onChange={event => setCreate(value => ({ ...value, initialStake: event.target.value }))}
                placeholder="20.00"
              />
            </label>
            <label>
              <span className="label">Isolated series bank</span>
              <input
                className="input font-mono"
                inputMode="decimal"
                value={create.bankrollLimit}
                onChange={event => setCreate(value => ({ ...value, bankrollLimit: event.target.value }))}
                placeholder="500.00"
              />
            </label>
            <label>
              <span className="label">Total exposure limit</span>
              <input
                className="input font-mono"
                inputMode="decimal"
                value={create.exposureLimit}
                onChange={event => setCreate(value => ({ ...value, exposureLimit: event.target.value }))}
                placeholder="250.00"
              />
            </label>
            <label>
              <span className="label">Per-step maximum · optional</span>
              <input
                className="input font-mono"
                inputMode="decimal"
                value={create.maximumStake}
                onChange={event => setCreate(value => ({ ...value, maximumStake: event.target.value }))}
                placeholder="100.00"
              />
            </label>
            <label>
              <span className="label">Stake increment</span>
              <input
                className="input font-mono"
                inputMode="decimal"
                value={create.stakeIncrement}
                onChange={event => setCreate(value => ({ ...value, stakeIncrement: event.target.value }))}
                placeholder="0.01"
              />
            </label>
            <label>
              <span className="label">Maximum steps</span>
              <input
                className="input font-mono"
                inputMode="numeric"
                value={create.maximumSteps}
                onChange={event => setCreate(value => ({ ...value, maximumSteps: event.target.value }))}
                placeholder="15"
              />
            </label>
            <label>
              <span className="label">Currency or unit</span>
              <input
                className="input font-mono uppercase"
                maxLength={16}
                value={create.currencyOrUnit}
                onChange={event => setCreate(value => ({ ...value, currencyOrUnit: event.target.value }))}
                placeholder="USD"
              />
            </label>
          </div>
        </BroadcastPanel>

        <BroadcastPanel className="p-4 sm:p-5">
          <label className="flex min-h-12 cursor-pointer items-start gap-3">
            <input
              className="mt-1 h-5 w-5 shrink-0 [accent-color:var(--signal)]"
              type="checkbox"
              checked={riskAccepted}
              onChange={event => setRiskAccepted(event.target.checked)}
            />
            <span className="text-xs leading-5 text-bn-muted">
              I understand that stake sizing does not increase event probability.
              A series can lose the full configured limit.
            </span>
          </label>
        </BroadcastPanel>

        {message ? (
          <div role="alert" aria-live="assertive">
            <BroadcastStatus status="negative">{message}</BroadcastStatus>
          </div>
        ) : null}
        <BroadcastButton className="min-h-12" disabled={busy} onClick={createSeries}>
          {busy ? 'Creating…' : 'Create isolated series'}
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
            <p className="editorial-kicker">Series · {series.formula_version}</p>
            <h2 className="mt-2 break-words font-display text-2xl font-black tracking-[-0.04em] text-bn-text">
              {series.match_label || 'Unlabelled training series'}
            </h2>
          </div>
          <BroadcastStatus status={isOpen ? 'review' : series.status === 'completed_win' ? 'success' : 'neutral'}>
            {statusLabel(series.status)}
          </BroadcastStatus>
        </div>
        <dl className="grid grid-cols-2 sm:grid-cols-4">
          <div className="border-b border-r border-bn-border-subtle p-4">
            <dt className="stat-label">Step</dt>
            <dd><BroadcastDataValue className="mt-2 block font-display text-2xl font-black">{series.steps.length}/{series.maximum_steps}</BroadcastDataValue></dd>
          </div>
          <div className="border-b border-r border-bn-border-subtle p-4">
            <dt className="stat-label">Loss</dt>
            <dd><BroadcastDataValue className="mt-2 block font-display text-2xl font-black">{formatMoneyMinor(loss)}</BroadcastDataValue></dd>
          </div>
          <div className="border-b border-r border-bn-border-subtle p-4">
            <dt className="stat-label">Target</dt>
            <dd><BroadcastDataValue className="mt-2 block font-display text-2xl font-black">{series.target_profit}</BroadcastDataValue></dd>
          </div>
          <div className="border-b border-bn-border-subtle p-4">
            <dt className="stat-label">Bank left</dt>
            <dd><BroadcastDataValue className="mt-2 block font-display text-2xl font-black">{formatMoneyMinor(remaining)}</BroadcastDataValue></dd>
          </div>
        </dl>
      </BroadcastPanel>

      {!isOpen ? (
        <BroadcastPanel className="p-5 text-center sm:p-7">
          <BroadcastStatus status={series.status === 'completed_win' ? 'success' : 'neutral'}>
            Series closed
          </BroadcastStatus>
          <h3 className="mt-5 font-display text-3xl font-black tracking-[-0.04em] text-bn-text">
            {realized === null ? 'Outcome recorded' : `${signedMoney(realized)} ${series.currency_or_unit}`}
          </h3>
          <p className="mt-3 text-xs leading-5 text-bn-muted">
            This is the recorded net series result, not a prediction of future outcomes.
          </p>
          <BroadcastButton className="mt-6 min-h-12 w-full" onClick={() => setShowCreate(true)}>
            Start another series
          </BroadcastButton>
        </BroadcastPanel>
      ) : pendingStep ? (
        <BroadcastPanel className="p-4 sm:p-6">
          <p className="editorial-kicker">02 · settle confirmed step</p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div>
              <span className="stat-label">Accepted</span>
              <BroadcastDataValue className="mt-1 block text-xl font-black">
                {pendingStep.accepted_stake} @ {pendingStep.accepted_odds}
              </BroadcastDataValue>
            </div>
            <div>
              <span className="stat-label">Projected net</span>
              <BroadcastDataValue className="mt-1 block text-xl font-black">
                {signedMoney(parseSignedMoneyMinor(pendingStep.projected_series_result))}
              </BroadcastDataValue>
            </div>
          </div>

          <fieldset className="mt-6">
            <legend className="label">Recorded result</legend>
            <div className="grid grid-cols-3 gap-2">
              {(['won', 'lost', 'void'] as const).map(result => (
                <BroadcastButton
                  key={result}
                  className="min-h-12"
                  tone={settlement === result ? 'primary' : 'secondary'}
                  aria-pressed={settlement === result}
                  onClick={() => setSettlement(result)}
                >
                  {result === 'won' ? 'Win' : result === 'lost' ? 'Loss' : 'Void'}
                </BroadcastButton>
              ))}
            </div>
          </fieldset>

          {settlement === 'won' ? (
            <label className="mt-4 block">
              <span className="label">Actual total return</span>
              <input
                className="input min-h-12 font-mono"
                inputMode="decimal"
                value={actualReturn}
                onChange={event => setActualReturn(event.target.value)}
                placeholder="Total payout including stake"
              />
            </label>
          ) : null}

          {message ? (
            <div className="mt-4" role="alert" aria-live="assertive">
              <BroadcastStatus status="negative">{message}</BroadcastStatus>
            </div>
          ) : null}
          <BroadcastButton className="mt-5 min-h-12 w-full" disabled={busy} onClick={settleStep}>
            {busy ? 'Saving…' : 'Save result'}
          </BroadcastButton>
        </BroadcastPanel>
      ) : (
        <BroadcastPanel className="p-4 sm:p-6">
          <p className="editorial-kicker">02 · current live step</p>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <label>
              <span className="label">Set · optional</span>
              <input className="input min-h-12 font-mono" inputMode="numeric" value={setNumber} onChange={event => setSetNumber(event.target.value)} />
            </label>
            <label>
              <span className="label">Game · optional</span>
              <input className="input min-h-12 font-mono" inputMode="numeric" value={gameNumber} onChange={event => setGameNumber(event.target.value)} />
            </label>
          </div>
          <label className="mt-4 block">
            <span className="label">Current quoted odds</span>
            <input
              className="input min-h-14 font-mono text-2xl font-black"
              inputMode="decimal"
              value={quotedOdds}
              onChange={event => setQuotedOdds(event.target.value)}
              placeholder="3.18"
            />
          </label>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <label>
              <span className="label">Accepted odds</span>
              <input
                className="input min-h-12 font-mono"
                inputMode="decimal"
                value={acceptedOdds}
                onChange={event => setAcceptedOdds(event.target.value)}
                placeholder={quotedOdds || '3.18'}
              />
            </label>
            <label>
              <span className="label">Accepted stake</span>
              <input
                className="input min-h-12 font-mono"
                inputMode="decimal"
                value={acceptedStake}
                onChange={event => setAcceptedStake(event.target.value)}
                placeholder={recommendation ?? '0.00'}
              />
            </label>
          </div>

          <div className="mt-5 grid grid-cols-2 overflow-hidden rounded-[var(--radius-control)] border border-bn-border-strong">
            <div className="border-r border-bn-border-subtle p-4">
              <span className="stat-label">Recommended</span>
              <BroadcastDataValue className="mt-2 block font-display text-3xl font-black">
                {recommendation ?? '—'}
              </BroadcastDataValue>
            </div>
            <div className="p-4">
              <span className="stat-label">Series net if win</span>
              <BroadcastDataValue className="mt-2 block font-display text-3xl font-black">
                {projected ?? '—'}
              </BroadcastDataValue>
            </div>
          </div>

          {recommendation ? (
            <BroadcastButton
              className="mt-3 w-full"
              tone="secondary"
              onClick={() => {
                setAcceptedStake(recommendation)
                if (!acceptedOdds) setAcceptedOdds(quotedOdds)
              }}
            >
              Use recommendation
            </BroadcastButton>
          ) : null}

          {blockReason ? (
            <div className="mt-4" role="alert" aria-live="polite">
              <BroadcastStatus status="negative">BLOCK · {blockReason}</BroadcastStatus>
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
            {busy ? 'Confirming…' : 'Confirm accepted step'}
          </BroadcastButton>
          <p className="mt-3 text-center text-[11px] leading-5 text-bn-quiet">
            The database recalculates every derived amount. This estimate does not guarantee an outcome.
          </p>
        </BroadcastPanel>
      )}

      {series.steps.length > 0 ? (
        <BroadcastPanel className="overflow-hidden p-0">
          <div className="border-b border-bn-border-strong p-4">
            <p className="editorial-kicker">Journal · server record</p>
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
                    Recommended {step.recommended_stake} · projected {signedMoney(parseSignedMoneyMinor(step.projected_series_result))}
                  </span>
                </span>
                <BroadcastStatus status={step.status === 'won' ? 'success' : step.status === 'lost' ? 'negative' : step.status === 'confirmed' ? 'review' : 'neutral'}>
                  {step.status}
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
              Stopping closes this series and cannot be undone.
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <BroadcastButton
                tone="secondary"
                disabled={busy}
                onClick={() => setStopArmed(false)}
              >
                Keep series
              </BroadcastButton>
              <BroadcastButton tone="destructive" disabled={busy} onClick={stopSeries}>
                {busy ? 'Stopping…' : 'Confirm stop'}
              </BroadcastButton>
            </div>
          </BroadcastPanel>
        ) : (
          <BroadcastButton tone="destructive" disabled={busy} onClick={() => setStopArmed(true)}>
            Stop series
          </BroadcastButton>
        )
      ) : null}
    </div>
  )
}
