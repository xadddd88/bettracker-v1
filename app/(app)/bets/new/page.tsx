'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import type { Sport } from '@/types'

const SPORTS: Sport[] = ['football', 'tennis', 'basketball', 'hockey', 'other']
const BOOKMAKERS = ['Bet365', 'William Hill', '1xBet', 'Stake', 'Pinnacle', 'Other']

export default function NewBetPage() {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [betType, setBetType] = useState<'single' | 'parlay'>('single')

  const [form, setForm] = useState({
    event_name: '',
    market_type: '',
    selection: '',
    odds: '',
    stake: '',
    sport: 'football' as Sport,
    bookmaker: '',
    is_live: false,
    notes: '',
  })

  function set(field: string, value: unknown) {
    setForm(f => ({ ...f, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

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

      const stake = parseFloat(form.odds)
      const odds  = parseFloat(form.odds)

      // 1. Create minimal Decision (source: quick_entry)
      const { data: decision, error: dErr } = await supabase
        .from('decisions')
        .insert({
          user_id:      user.id,
          event_name:   form.event_name,
          sport:        form.sport,
          market_type:  form.market_type,
          selection:    form.selection,
          offered_odds: parseFloat(form.odds),
          bookmaker:    form.bookmaker || null,
          source:       'quick_entry',
          final_action: 'placed',
        })
        .select('id')
        .single()

      if (dErr) throw dErr

      // 2. Create Bet
      const { data: bet, error: bErr } = await supabase
        .from('bets')
        .insert({
          user_id:         user.id,
          bankroll_id:     bankroll?.id || null,
          bet_type:        betType,
          stake:           parseFloat(form.stake),
          total_odds:      parseFloat(form.odds),
          potential_payout: parseFloat(form.stake) * parseFloat(form.odds),
          status:          'pending',
          bookmaker:       form.bookmaker || null,
          source:          'quick_entry',
          notes:           form.notes || null,
        })
        .select('id')
        .single()

      if (bErr) throw bErr

      // 3. Create BetLeg (linked to decision)
      const { error: lErr } = await supabase
        .from('bet_legs')
        .insert({
          bet_id:      bet.id,
          decision_id: decision.id,
          sport:       form.sport,
          event_name:  form.event_name,
          market_type: form.market_type,
          selection:   form.selection,
          odds:        parseFloat(form.odds),
          leg_status:  'pending',
        })

      if (lErr) throw lErr

      // 4. Record stake transaction
      await supabase.from('bankroll_transactions').insert({
        user_id:    user.id,
        bankroll_id: bankroll?.id || null,
        bet_id:     bet.id,
        type:       'stake',
        amount:     -parseFloat(form.stake),
      })

      router.push('/bets')
      router.refresh()

    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Add Bet</h1>
        <p className="text-sm text-gray-500 mt-1">Quick entry — a Decision is created automatically</p>
      </div>

      {/* Bet type toggle */}
      <div className="flex gap-1 bg-gray-800 rounded-lg p-1 mb-4 w-fit">
        {(['single', 'parlay'] as const).map(t => (
          <button key={t} type="button"
            onClick={() => setBetType(t)}
            className={`px-4 py-1.5 text-sm rounded-md font-medium transition-colors capitalize ${betType === t ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'}`}>
            {t}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="card flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="label">Event *</label>
            <input className="input" placeholder="Germany vs Netherlands"
              value={form.event_name} onChange={e => set('event_name', e.target.value)} required />
          </div>

          <div>
            <label className="label">Market *</label>
            <input className="input" placeholder="П1 / ТБ 2.5 / Ф1 +1"
              value={form.market_type} onChange={e => set('market_type', e.target.value)} required />
          </div>

          <div>
            <label className="label">Selection</label>
            <input className="input" placeholder="Germany"
              value={form.selection} onChange={e => set('selection', e.target.value)} />
          </div>

          <div>
            <label className="label">Odds *</label>
            <input className="input" type="number" step="0.01" min="1.01" placeholder="1.85"
              value={form.odds} onChange={e => set('odds', e.target.value)} required />
          </div>

          <div>
            <label className="label">Stake *</label>
            <input className="input" type="number" step="0.01" min="0.01" placeholder="50"
              value={form.stake} onChange={e => set('stake', e.target.value)} required />
          </div>

          <div>
            <label className="label">Sport</label>
            <select className="input" value={form.sport} onChange={e => set('sport', e.target.value)}>
              {SPORTS.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
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
            <textarea className="input resize-none" rows={2} placeholder="Optional..."
              value={form.notes} onChange={e => set('notes', e.target.value)} />
          </div>
        </div>

        {/* Payout preview */}
        {form.odds && form.stake && (
          <div className="bg-gray-800 rounded-lg px-4 py-3 flex justify-between text-sm">
            <span className="text-gray-400">Potential payout</span>
            <span className="text-white font-semibold">
              ${(parseFloat(form.stake) * parseFloat(form.odds)).toFixed(2)}
            </span>
          </div>
        )}

        {error && (
          <div className="text-xs text-red-400 bg-red-950/40 border border-red-900 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        <div className="flex gap-3">
          <button type="submit" className="btn-primary flex-1" disabled={loading}>
            {loading ? 'Saving...' : 'Save Bet'}
          </button>
          <button type="button" className="btn-ghost" onClick={() => router.back()}>Cancel</button>
        </div>
      </form>
    </div>
  )
}
