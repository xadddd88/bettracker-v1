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
    <div className="flex flex-col gap-6 max-w-lg">
      {/* Profile */}
      <div className="card flex flex-col gap-4">
        <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">Profile</h2>
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
      <div className="card flex flex-col gap-4">
        <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">Currency & Bankroll</h2>
        <div>
          <label className="label">Currency</label>
          <div className="flex gap-2 flex-wrap mt-1">
            {CURRENCIES.map(c => (
              <button
                key={c}
                type="button"
                onClick={() => setCurrency(c)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                  currency === c
                    ? 'bg-indigo-600 border-indigo-500 text-white'
                    : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500'
                }`}
              >
                {CURRENCY_SYMBOLS[c]} {c}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-amber-500 mt-1.5">
            ⚠ Changing currency does not convert your balance.
          </p>
        </div>
        <div>
          <label className="label">Default stake</label>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-gray-500 text-sm">{CURRENCY_SYMBOLS[currency]}</span>
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
      <div className="card flex flex-col gap-4">
        <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">AI & Analysis</h2>
        <div>
          <label className="label">
            Kelly fraction — <span className="text-indigo-400 font-mono">{kellyFraction.toFixed(2)}×</span>
          </label>
          <input
            className="w-full mt-2 accent-indigo-500"
            type="range"
            min={0.1}
            max={1.0}
            step={0.05}
            value={kellyFraction}
            onChange={e => setKellyFraction(parseFloat(e.target.value))}
          />
          <div className="flex justify-between text-[10px] text-gray-600 mt-0.5">
            <span>0.10× (cautious)</span>
            <span>1.00× (full Kelly)</span>
          </div>
        </div>
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <label className="label">Web search in Scout & Analyst</label>
            <p className="text-[11px] text-gray-600 mt-0.5">
              Allows Scout and Analyst to consult current sources. Exact pricing still requires verified model inputs. Requires server-side activation.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={webSearchEnabled}
            onClick={() => setWebSearchEnabled(v => !v)}
            className={`relative shrink-0 mt-0.5 w-10 h-5 rounded-full transition-colors ${
              webSearchEnabled ? 'bg-indigo-600' : 'bg-gray-700'
            }`}
          >
            <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
              webSearchEnabled ? 'translate-x-5' : 'translate-x-0.5'
            }`} />
          </button>
        </div>
      </div>

      {/* Account */}
      <div className="card flex flex-col gap-4">
        <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">Account</h2>
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
          <p className="text-[11px] text-gray-600 mt-0.5">e.g. Europe/Kyiv, America/New_York</p>
        </div>
      </div>

      {errorMsg && (
        <div className="text-xs text-red-400 bg-red-950/40 border border-red-900 rounded-lg px-3 py-2">
          {errorMsg}
        </div>
      )}
      {successMsg && (
        <div className="text-xs text-green-400 bg-green-950/40 border border-green-900 rounded-lg px-3 py-2">
          ✓ {successMsg}
        </div>
      )}

      <button
        className="btn-primary max-w-lg"
        onClick={handleSave}
        disabled={saving}
      >
        {saving ? 'Saving…' : 'Save settings'}
      </button>
    </div>
  )
}
