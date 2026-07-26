'use client'

import { useState, useCallback } from 'react'
import type { Profile } from '@/types'
import { BroadcastButton, BroadcastDataValue, BroadcastPanel, BroadcastStatus } from '@/components/ui/BroadcastNoir'
import { currencySymbol } from '@/lib/money'

const CURRENCIES = ['USD', 'EUR', 'UAH', 'GBP', 'CAD', 'AUD'] as const
type Currency = typeof CURRENCIES[number]

interface SettingsFormProps {
  profile: Profile
  email: string
}

export default function SettingsForm({ profile, email }: SettingsFormProps) {
  const [displayName,       setDisplayName]       = useState(profile.display_name ?? '')
  const [currency,          setCurrency]          = useState<Currency>((profile.currency as Currency) ?? 'USD')
  const [defaultStake,      setDefaultStake]      = useState(String(profile.default_stake ?? 10))
  const [kellyFraction,     setKellyFraction]     = useState(profile.kelly_fraction ?? 0.5)
  const [webSearchEnabled,  setWebSearchEnabled]  = useState(profile.web_search_enabled ?? false)
  const [timezone,          setTimezone]          = useState(profile.timezone ?? 'UTC')

  const [saving,      setSaving]      = useState(false)
  const [successMsg,  setSuccessMsg]  = useState('')
  const [errorMsg,    setErrorMsg]    = useState('')

  const handleSave = useCallback(async () => {
    setSuccessMsg('')
    setErrorMsg('')

    const stakeNum = parseFloat(defaultStake)
    if (isNaN(stakeNum) || stakeNum < 0.01 || stakeNum > 100_000) {
      setErrorMsg('Базовая ставка должна быть от 0.01 до 100 000')
      return
    }

    setSaving(true)
    try {
      const res = await fetch('/api/settings', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          display_name:       displayName.trim() || undefined,
          currency,
          default_stake:      stakeNum,
          kelly_fraction:     kellyFraction,
          web_search_enabled: webSearchEnabled,
          timezone:           timezone.trim() || 'UTC',
        }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        setErrorMsg(json.error ?? 'Не удалось сохранить настройки')
        return
      }
      setSuccessMsg('Настройки сохранены')
      setTimeout(() => setSuccessMsg(''), 3000)
    } catch {
      setErrorMsg('Ошибка сети — попробуйте ещё раз')
    } finally {
      setSaving(false)
    }
  }, [displayName, currency, defaultStake, kellyFraction, webSearchEnabled, timezone])

  return (
    <div className="flex max-w-lg flex-col gap-4">
      {/* Profile */}
      <BroadcastPanel className="flex flex-col gap-4 p-4 sm:p-5">
        <h2 className="font-mono text-[11px] font-black uppercase tracking-[0.08em] text-bn-text">Профиль</h2>
        <div>
          <label className="label">Имя в приложении</label>
          <input
            className="input mt-1"
            type="text"
            maxLength={50}
            placeholder="Ваше имя"
            value={displayName}
            onChange={e => setDisplayName(e.target.value)}
          />
        </div>
      </BroadcastPanel>

      {/* Currency & Bankroll */}
      <BroadcastPanel className="flex flex-col gap-4 p-4 sm:p-5">
        <h2 className="font-mono text-[11px] font-black uppercase tracking-[0.08em] text-bn-text">Валюта и банкролл</h2>
        <div>
          <label className="label">Валюта</label>
          <div className="flex gap-2 flex-wrap mt-1">
            {CURRENCIES.map(c => (
              <BroadcastButton
                key={c}
                type="button"
                onClick={() => setCurrency(c)}
                aria-pressed={currency === c}
                tone={currency === c ? 'primary' : 'secondary'}
              >
                {currencySymbol(c)} {c}
              </BroadcastButton>
            ))}
          </div>
          <div className="mt-2"><BroadcastStatus status="review">Смена валюты не конвертирует баланс.</BroadcastStatus></div>
        </div>
        <div>
          <label className="label">Базовая ставка</label>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-sm text-bn-muted">{currencySymbol(currency)}</span>
            <input
              className="input flex-1"
              type="number"
              min={0.01}
              max={100_000}
              step={0.01}
              value={defaultStake}
              onChange={e => setDefaultStake(e.target.value)}
            />
          </div>
        </div>
      </BroadcastPanel>

      {/* AI & Analysis */}
      <BroadcastPanel className="flex flex-col gap-4 p-4 sm:p-5">
        <h2 className="font-mono text-[11px] font-black uppercase tracking-[0.08em] text-bn-text">AI и анализ</h2>
        <div>
          <label className="label">
            Доля Kelly — <BroadcastDataValue>{kellyFraction.toFixed(2)}×</BroadcastDataValue>
          </label>
          <input
            className="mt-2 w-full [accent-color:var(--signal)]"
            type="range"
            min={0.1}
            max={1.0}
            step={0.05}
            value={kellyFraction}
            onChange={e => setKellyFraction(parseFloat(e.target.value))}
          />
          <div className="mt-0.5 flex justify-between text-[11px] text-bn-muted">
            <span>0.10× (осторожно)</span>
            <span>1.00× (полный Kelly)</span>
          </div>
        </div>
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <label className="label">Веб-поиск в Scout и Analyst</label>
            <p className="mt-0.5 text-[11px] text-bn-muted">
              Позволяет Scout и Analyst сверяться с актуальными источниками. Точные коэффициенты всё равно требуют проверенных входных данных. Нужна серверная активация.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={webSearchEnabled}
            aria-label="Веб-поиск в Scout и Analyst"
            onClick={() => setWebSearchEnabled(v => !v)}
            className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-control border transition-colors ${
              webSearchEnabled ? 'border-bn-signal bg-bn-signal' : 'border-bn-border-strong bg-bn-raised'
            }`}
          >
            <span aria-hidden className={`absolute top-0.5 h-[18px] w-[18px] rounded-control transition-transform ${
              webSearchEnabled ? 'translate-x-[21px] bg-bn-on-signal' : 'translate-x-0.5 bg-bn-text'
            }`} />
          </button>
        </div>
      </BroadcastPanel>

      {/* Account */}
      <BroadcastPanel className="flex flex-col gap-4 p-4 sm:p-5">
        <h2 className="font-mono text-[11px] font-black uppercase tracking-[0.08em] text-bn-text">Аккаунт</h2>
        <div>
          <label className="label">Email</label>
          <input
            className="input mt-1 opacity-50 cursor-not-allowed"
            type="email"
            value={email}
            disabled
            readOnly
          />
        </div>
        <div>
          <label className="label">Часовой пояс</label>
          <input
            className="input mt-1"
            type="text"
            placeholder="UTC"
            value={timezone}
            onChange={e => setTimezone(e.target.value)}
          />
          <p className="mt-0.5 text-[11px] text-bn-muted">Например: Europe/Kyiv, America/New_York</p>
        </div>
      </BroadcastPanel>

      {errorMsg && (
        <BroadcastStatus className="w-full" status="negative">{errorMsg}</BroadcastStatus>
      )}
      {successMsg && (
        <BroadcastStatus className="w-full" status="success">{successMsg}</BroadcastStatus>
      )}

      <BroadcastButton
        className="max-w-lg"
        onClick={handleSave}
        disabled={saving}
      >
        {saving ? 'Сохраняем…' : 'Сохранить настройки'}
      </BroadcastButton>
    </div>
  )
}
