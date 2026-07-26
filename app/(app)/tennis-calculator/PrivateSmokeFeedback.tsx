'use client'

import { useState } from 'react'

import {
  BroadcastButton,
  BroadcastPanel,
  BroadcastStatus,
} from '@/components/ui/BroadcastNoir'

type SmokeAnswer = 'pass' | 'fail' | ''

interface SmokeState {
  access: SmokeAnswer
  series: SmokeAnswer
  profit: SmokeAnswer
  analysis: SmokeAnswer
  screenshotSent: SmokeAnswer
  foundMatches: string
  mobileIssue: string
  confusingCopy: string
}

const INITIAL_SMOKE: SmokeState = {
  access: '',
  series: '',
  profit: '',
  analysis: '',
  screenshotSent: '',
  foundMatches: '',
  mobileIssue: '',
  confusingCopy: '',
}

const CHECKS: Array<{ key: keyof Pick<SmokeState, 'access' | 'series' | 'profit' | 'analysis' | 'screenshotSent'>; label: string }> = [
  { key: 'access',         label: 'Калькулятор открылся без 404' },
  { key: 'series',         label: 'Серия создалась без помощи' },
  { key: 'profit',         label: 'Рост прибыли по геймам понятен' },
  { key: 'analysis',       label: 'Анализ за 24 часа завершился' },
  { key: 'screenshotSent', label: 'Скрин отправлен Диме' },
]

function line(label: string, answer: SmokeAnswer): string {
  return `${label}: ${answer === 'pass' ? 'PASS' : answer === 'fail' ? 'FAIL' : 'NOT_SET'}`
}

function hasFailure(state: SmokeState): boolean {
  return CHECKS.some(check => state[check.key] === 'fail')
}

function missingRequired(state: SmokeState): boolean {
  return CHECKS.some(check => state[check.key] === '') || state.foundMatches.trim() === ''
}

function buildSmokeMessage(state: SmokeState): string {
  const foundMatches = state.foundMatches.trim()
  const mobileIssue = state.mobileIssue.trim() || 'none'
  const confusingCopy = state.confusingCopy.trim() || 'none'

  return [
    '[tennis_private_smoke_v1]',
    line('Access without 404', state.access),
    line('Series creation', state.series),
    line('Profit growth visible', state.profit),
    line('24h analysis completed', state.analysis),
    line('Screenshot sent', state.screenshotSent),
    `Found matches: ${foundMatches}`,
    `Mobile issue: ${mobileIssue}`,
    `Confusing copy: ${confusingCopy}`,
  ].join('\n')
}

export function PrivateSmokeFeedback() {
  const [state, setState] = useState<SmokeState>(INITIAL_SMOKE)
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  function setAnswer(key: keyof SmokeState, value: string) {
    setState(current => ({ ...current, [key]: value }))
    setError('')
    setSent(false)
  }

  async function submitSmoke() {
    if (missingRequired(state)) {
      setError('Заполните все PASS/FAIL и количество найденных матчей.')
      return
    }

    const message = buildSmokeMessage(state)
    setBusy(true)
    setError('')
    try {
      const response = await fetch('/api/feedback', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rating: hasFailure(state) ? 2 : 5,
          category: hasFailure(state) ? 'bug' : 'general',
          message,
        }),
      })
      const body = await response.json() as { success?: boolean; error?: string }
      if (!response.ok || !body.success) {
        setError(body.error ?? 'Не удалось отправить отчёт.')
        return
      }
      setSent(true)
      setState(INITIAL_SMOKE)
    } catch {
      setError('Сетевая ошибка. Попробуйте ещё раз.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <BroadcastPanel className="p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="editorial-kicker">Закрытый тест</p>
          <h2 className="mt-2 font-display text-2xl font-black tracking-[-0.04em] text-bn-text">
            Отчёт после проверки
          </h2>
        </div>
        <BroadcastStatus status="review">2 тестера</BroadcastStatus>
      </div>

      <p className="mt-4 text-xs leading-5 text-bn-muted">
        Заполните после теста. Отчёт сохраняется как beta feedback; в аналитику уходят
        только оценка и тип, без денег, коэффициентов, названий матчей и текста отчёта.
      </p>

      <div className="mt-5 grid gap-3">
        {CHECKS.map(check => (
          <fieldset key={check.key} className="grid gap-2 border-b border-bn-border-subtle pb-3 last:border-b-0 last:pb-0">
            <legend className="text-sm font-black text-bn-text">{check.label}</legend>
            <div className="grid grid-cols-2 gap-2">
              {(['pass', 'fail'] as const).map(value => (
                <BroadcastButton
                  key={value}
                  tone={state[check.key] === value ? 'primary' : 'secondary'}
                  aria-pressed={state[check.key] === value}
                  onClick={() => setAnswer(check.key, value)}
                >
                  {value === 'pass' ? 'Да' : 'Нет'}
                </BroadcastButton>
              ))}
            </div>
          </fieldset>
        ))}
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label>
          <span className="label">Сколько матчей нашёл анализ</span>
          <input
            className="input font-mono"
            inputMode="numeric"
            min="0"
            max="999"
            value={state.foundMatches}
            onChange={event => setAnswer('foundMatches', event.target.value.replace(/\D/g, '').slice(0, 3))}
            placeholder="0"
          />
        </label>
        <label>
          <span className="label">Что было неудобно на телефоне</span>
          <input
            className="input"
            maxLength={500}
            value={state.mobileIssue}
            onChange={event => setAnswer('mobileIssue', event.target.value)}
            placeholder="Если всё ок — оставить пустым"
          />
        </label>
        <label className="sm:col-span-2">
          <span className="label">Что было непонятно в тексте</span>
          <textarea
            className="input min-h-24 resize-none text-sm"
            maxLength={700}
            value={state.confusingCopy}
            onChange={event => setAnswer('confusingCopy', event.target.value)}
            placeholder="Если всё понятно — оставить пустым"
          />
        </label>
      </div>

      {error ? (
        <div className="mt-4" role="alert" aria-live="assertive">
          <BroadcastStatus status="negative">{error}</BroadcastStatus>
        </div>
      ) : null}
      {sent ? (
        <div className="mt-4" role="status" aria-live="polite">
          <BroadcastStatus status="success">Отчёт отправлен</BroadcastStatus>
        </div>
      ) : null}

      <BroadcastButton className="mt-5 min-h-12 w-full" disabled={busy} onClick={submitSmoke}>
        {busy ? 'Отправляем…' : 'Отправить отчёт'}
      </BroadcastButton>
    </BroadcastPanel>
  )
}
