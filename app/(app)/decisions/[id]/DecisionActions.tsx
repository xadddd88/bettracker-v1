'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

interface Props {
  decisionId: string
  offeredOdds: number | null
}

export default function DecisionActions({ decisionId, offeredOdds }: Props) {
  const supabase = createClient()
  const router   = useRouter()

  const [saving, setSaving]   = useState(false)
  const [error,  setError]    = useState('')
  const [stakeInput, setStakeInput] = useState('')
  const [showStake,  setShowStake]  = useState(false)

  async function handleAction(action: 'placed' | 'skipped' | 'watchlisted') {
    if (action === 'placed' && !showStake) {
      setShowStake(true)
      return
    }

    setSaving(true)
    setError('')
    try {
      if (action === 'placed') {
        const stake = parseFloat(stakeInput)
        if (!stake || stake <= 0) { setError('Enter a valid stake amount'); setSaving(false); return }

        const { error: betErr } = await supabase.rpc('place_bet_from_decision', {
          p_decision_id: decisionId,
          p_stake:       stake,
        })
        if (betErr) throw new Error(betErr.message || betErr.details || JSON.stringify(betErr))
      } else {
        const { error: actionErr } = await supabase.rpc('update_decision_action', {
          p_decision_id:  decisionId,
          p_final_action: action,
        })
        if (actionErr) throw new Error(actionErr.message || actionErr.details || JSON.stringify(actionErr))
      }

      router.refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {showStake && (
        <div className="card border border-indigo-800 flex flex-col gap-3">
          <p className="text-sm text-gray-300">
            Enter stake amount{offeredOdds ? ` (odds: ${offeredOdds})` : ''}:
          </p>
          <input
            className="input"
            type="number" step="0.01" min="0.01" placeholder="100"
            value={stakeInput}
            onChange={e => setStakeInput(e.target.value)}
            autoFocus
          />
          <div className="flex gap-2">
            <button className="btn-primary flex-1" onClick={() => handleAction('placed')} disabled={saving}>
              {saving ? 'Saving…' : 'Confirm Bet'}
            </button>
            <button className="btn-ghost" onClick={() => { setShowStake(false); setStakeInput('') }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {!showStake && (
        <div className="flex gap-3">
          <button
            className="btn-primary flex-1"
            onClick={() => handleAction('placed')}
            disabled={saving}
          >
            ✅ Place Bet
          </button>
          <button
            className="flex-1 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-medium transition-colors border border-gray-700 disabled:opacity-50"
            onClick={() => handleAction('watchlisted')}
            disabled={saving}
          >
            👁 Watch
          </button>
          <button
            className="flex-1 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 text-sm font-medium transition-colors border border-gray-700 disabled:opacity-50"
            onClick={() => handleAction('skipped')}
            disabled={saving}
          >
            ✕ Skip
          </button>
        </div>
      )}

      {error && (
        <div className="text-xs text-red-400 bg-red-950/40 border border-red-900 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      <p className="text-xs text-gray-600 text-center">
        Skipping or watching is a valid decision — it will be saved to your history.
      </p>
    </div>
  )
}
