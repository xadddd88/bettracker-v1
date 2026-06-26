'use client'

import { useState } from 'react'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import type { Sport } from '@/types'

const SPORTS: Sport[] = ['football', 'tennis', 'basketball', 'hockey', 'other']
const BOOKMAKERS = ['Bet365', 'William Hill', '1xBet', 'Stake', 'Pinnacle', 'Other']

// ─── Validation schema ───────────────────────────────────────
const quickBetSchema = z.object({
  event_name:  z.string().min(1, 'Event name is required'),
  market_type: z.string().min(1, 'Market is required'),
  selection:   z.string().optional(),
  odds:        z.number({ invalid_type_error: 'Odds must be a number' }).min(1.01, 'Odds must be greater than 1.00'),
  stake:       z.number({ invalid_type_error: 'Stake must be a number' }).positive('Stake must be positive'),
  sport:       z.enum(['football', 'tennis', 'basketball', 'hockey', 'other']),
  bookmaker:   z.string().nullable().optional(),
  notes:       z.string().nullable().optional(),
})

type FormErrors = Partial<Record<keyof z.infer<typeof quickBetSchema> | '_root', string>>

export default function NewBetPage() {
  const router  = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [errors,  setErrors]  = useState<FormErrors>({})

  const [form, setForm] = useState({
    event_name:  '',
    market_type: '',
    selection:   '',
    odds:        '',
    stake:       '',
    sport:       'football' as Sport,
    bookmaker:   '',
    notes:       '',
  })

  function set(field: string, value: unknown) {
    setForm(f => ({ ...f, [field]: value }))
    setErrors(e => ({ ...e, [field]: undefined }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErrors({})

    // ── Client-side validation ─────────────────────────────
    const parsed = quickBetSchema.safeParse({
      ...form,
      odds:  form.odds  ? parseFloat(form.odds)  : undefined,
      stake: form.stake ? parseFloat(form.stake) : undefined,
      bookmaker: form.bookmaker || null,
      notes:     form.notes     || null,
    })

    if (!parsed.success) {
      const fieldErrors: FormErrors = {}
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof FormErrors
        fieldErrors[key] = issue.message
      }
      setErrors(fieldErrors)
      return
    }

    setLoading(true)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      // Get default bankroll
      const { data: bankroll } = await supabase
        .from('bankrolls')
        .select('id')
        .eq('user_id', user.id)
        .eq('is_default', true)
        .single()

      // ── Single atomic RPC — all 4 inserts + balance update ─
      const { error: rpcErr } = await supabase.rpc('create_quick_bet', {
        p_user_id:      user.id,
        p_bankroll_id:  bankroll?.id ?? null,
        p_event_name:   parsed.data.event_name,
        p_sport:        parsed.data.sport,
        p_market_type:  parsed.data.market_type,
        p_selection:    parsed.data.selection ?? null,
        p_offered_odds: parsed.data.odds,
        p_stake:        parsed.data.stake,
        p_bookmaker:    parsed.data.bookmaker ?? null,
        p_notes:        parsed.data.notes ?? null,
      })

      if (rpcErr) throw rpcErr

      router.push('/bets')
      router.refresh()

    } catch (err: unknown) {
      setErrors({ _root: err instanceof Error ? err.message : 'Something went wrong' })
    } finally {
      setLoading(false)
    }
  }

  const oddsNum  = parseFloat(form.odds)
  const stakeNum = parseFloat(form.stake)
  const showPreview = !isNaN(oddsNum) && !isNaN(stakeNum) && oddsNum > 1 && stakeNum > 0

  return (
    <div className="max-w-xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Add Bet</h1>
        <p className="text-sm text-gray-500 mt-1">Quick entry — a Decision is created automatically</p>
      </div>

      {/* Parlay is Sprint 2 — single only for now */}
      <div className="flex gap-1 bg-gray-800 rounded-lg p-1 mb-4 w-fit">
        <div className="px-4 py-1.5 text-sm rounded-md font-medium bg-indigo-600 text-white capitalize">
          Single
        </div>
        <div className="px-4 py-1.5 text-sm rounded-md text-gray-600 cursor-not-allowed capitalize" title="Coming in Sprint 2">
          Parlay
        </div>
      </div>

      <form onSubmit={handleSubmit} className="card flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="label">Event *</label>
            <input
              className={`input ${errors.event_name ? 'border-red-600' : ''}`}
              placeholder="Germany vs Netherlands"
              value={form.event_name}
              onChange={e => set('event_name', e.target.value)}
            />
            {errors.event_name && <p className="text-xs text-red-400 mt-1">{errors.event_name}</p>}
          </div>

          <div>
            <label className="label">Market *</label>
            <input
              className={`input ${errors.market_type ? 'border-red-600' : ''}`}
              placeholder="П1 / ТБ 2.5 / Ф1 +1"
              value={form.market_type}
              onChange={e => set('market_type', e.target.value)}
            />
            {errors.market_type && <p className="text-xs text-red-400 mt-1">{errors.market_type}</p>}
          </div>

          <div>
            <label className="label">Selection</label>
            <input
              className="input"
              placeholder="Germany"
              value={form.selection}
              onChange={e => set('selection', e.target.value)}
            />
          </div>

          <div>
            <label className="label">Odds *</label>
            <input
              className={`input ${errors.odds ? 'border-red-600' : ''}`}
              type="number" step="0.01" min="1.01" placeholder="1.85"
              value={form.odds}
              onChange={e => set('odds', e.target.value)}
            />
            {errors.odds && <p className="text-xs text-red-400 mt-1">{errors.odds}</p>}
          </div>

          <div>
            <label className="label">Stake *</label>
            <input
              className={`input ${errors.stake ? 'border-red-600' : ''}`}
              type="number" step="0.01" min="0.01" placeholder="50"
              value={form.stake}
              onChange={e => set('stake', e.target.value)}
            />
            {errors.stake && <p className="text-xs text-red-400 mt-1">{errors.stake}</p>}
          </div>

          <div>
            <label className="label">Sport</label>
            <select className="input" value={form.sport} onChange={e => set('sport', e.target.value)}>
              {SPORTS.map(s => (
                <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="label">Bookmaker</label>
            <select className="input" value={form.bookmaker} onChange={e => set('bookmaker', e.target.value)}>
              <option value="">—</option>
              {BOOKMAKERS.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>

          <div className="col-span-2">
            <label className="label">Notes</label>
            <textarea
              className="input resize-none" rows={2} placeholder="Optional..."
              value={form.notes}
              onChange={e => set('notes', e.target.value)}
            />
          </div>
        </div>

        {/* Payout preview */}
        {showPreview && (
          <div className="bg-gray-800 rounded-lg px-4 py-3 flex justify-between text-sm">
            <span className="text-gray-400">Potential payout</span>
            {/* TODO: Currency should come from bankroll.currency */}
            <span className="text-white font-semibold">
              ${(stakeNum * oddsNum).toFixed(2)}
            </span>
          </div>
        )}

        {errors._root && (
          <div className="text-xs text-red-400 bg-red-950/40 border border-red-900 rounded-lg px-3 py-2">
            {errors._root}
          </div>
        )}

        <div className="flex gap-3">
          <button type="submit" className="btn-primary flex-1" disabled={loading}>
            {loading ? 'Saving...' : 'Save Bet'}
          </button>
          <button type="button" className="btn-ghost" onClick={() => router.back()}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}
