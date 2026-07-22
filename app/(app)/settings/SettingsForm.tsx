'use client'

import { useState, useCallback } from 'react'
import type { Profile } from '@/types'

const CURRENCIES = ['USD', 'EUR', 'UAH', 'GBP', 'CAD', 'AUD'] as const
type Currency = typeof CURRENCIES[number]

const CURRENCY_SYMBOLS: Record<Currency, string> = {
  USD: '$', EUR: '€', UAH: '₴', GBP: '£', CAD: 'CA$', AUD: 'A$',
}

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
      setErrorMsg('Default stake must be between 0.01 and 100,000')
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
        setErrorMsg(json.error ?? 'Failed to save settings')
        return
      }
      setSuccessMsg('Settings saved')
      setTimeout(() => setSuccessMsg(''), 3000)
    } catch {
      setErrorMsg('Network error — please try again')
    } finally {
      setSaving(false)
    }
  }, [displayName, currency, defaultStake, kellyFraction, webSearchEnabled, timezone])

  return (
    <div className="bn-page flex max-w-2xl flex-col gap-5">
      {/* Profile */}
      <div className="bn-panel flex flex-col gap-4 p-4 sm:p-5">
        <h2 className="editorial-kicker">Profile</h2>
        <div>
          <label className="label">Display name</label>
          <input
            className="input mt-1"
            type="text"
            maxLength={50}
            placeholder="Your name"
            value={displayName}
            onChange={e => setDisplayName(e.target.value)}
          />
        </div>
      </div>

      {/* Currency & Bankroll */}
      <div className="bn-panel flex flex-col gap-4 p-4 sm:p-5">
        <h2 className="editorial-kicker">Currency & Bankroll</h2>
        <div>
          <label className="label">Currency</label>
          <div className="flex gap-2 flex-wrap mt-1">
            {CURRENCIES.map(c => (
              <button
                key={c}
                type="button"
                onClick={() => setCurrency(c)}
                className={`bn-button min-w-20 ${
                  currency === c
                    ? 'bn-button-primary'
                    : 'bn-button-secondary'
                }`}
              >
                {CURRENCY_SYMBOLS[c]} {c}
              </button>
            ))}
          </div>
          <p className="mt-2 border-l-2 border-[var(--review)] pl-3 text-xs text-[var(--review)]">
            ! Changing currency does not convert your balance.
          </p>
        </div>
        <div>
          <label className="label">Default stake</label>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-sm text-[var(--text-muted)]">{CURRENCY_SYMBOLS[currency]}</span>
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
      </div>

      {/* AI & Analysis */}
      <div className="bn-panel flex flex-col gap-4 p-4 sm:p-5">
        <h2 className="editorial-kicker">AI & Analysis</h2>
        <div>
          <label className="label">
            Kelly fraction — <span className="bn-data-value font-mono">{kellyFraction.toFixed(2)}×</span>
          </label>
          <input
            className="mt-2 w-full accent-[var(--signal)]"
            type="range"
            min={0.1}
            max={1.0}
            step={0.05}
            value={kellyFraction}
            onChange={e => setKellyFraction(parseFloat(e.target.value))}
          />
          <div className="mt-1 flex justify-between text-xs text-[var(--text-muted)]">
            <span>0.10× (cautious)</span>
            <span>1.00× (full Kelly)</span>
          </div>
        </div>
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <label className="label">Web search in Scout & Analyst</label>
            <p className="mt-1 text-xs leading-relaxed text-[var(--text-muted)]">
              Allows Scout and Analyst to consult current sources. Exact pricing still requires verified model inputs. Requires server-side activation.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={webSearchEnabled}
            onClick={() => setWebSearchEnabled(v => !v)}
            className={`relative mt-0.5 h-7 w-12 shrink-0 rounded-full border transition-colors ${
              webSearchEnabled ? 'border-[var(--signal)] bg-[var(--signal)]' : 'border-[var(--border-strong)] bg-[var(--field-raised)]'
            }`}
            aria-label="Web search in Scout and Analyst"
          >
            <span className={`absolute top-1 h-[18px] w-[18px] rounded-full bg-[var(--text-primary)] transition-transform ${
              webSearchEnabled ? 'translate-x-6' : 'translate-x-1'
            }`} />
          </button>
        </div>
      </div>

      {/* Account */}
      <div className="bn-panel flex flex-col gap-4 p-4 sm:p-5">
        <h2 className="editorial-kicker">Account</h2>
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
          <label className="label">Timezone</label>
          <input
            className="input mt-1"
            type="text"
            placeholder="UTC"
            value={timezone}
            onChange={e => setTimezone(e.target.value)}
          />
          <p className="mt-1 text-xs text-[var(--text-muted)]">e.g. Europe/Kyiv, America/New_York</p>
        </div>
      </div>

      {errorMsg && (
        <div className="bn-status bn-status-negative w-full justify-start" role="alert">
          <span className="bn-status-icon" aria-hidden>×</span><span>{errorMsg}</span>
        </div>
      )}
      {successMsg && (
        <div className="bn-status bn-status-success w-full justify-start" role="status">
          <span className="bn-status-icon" aria-hidden>✓</span><span>{successMsg}</span>
        </div>
      )}

      <button
        className="bn-button bn-button-primary w-full sm:w-auto sm:self-start"
        onClick={handleSave}
        disabled={saving}
      >
        {saving ? 'Saving…' : 'Save settings'}
      </button>
    </div>
  )
}
