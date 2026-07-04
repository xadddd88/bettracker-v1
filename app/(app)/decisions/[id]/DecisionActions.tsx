'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { trackClientEvent } from '@/lib/analytics/client'
import { EVENTS } from '@/lib/analytics/events'
import { bucketOdds, bucketStake } from '@/lib/analytics/buckets'
import RiskEvaluator from '@/components/risk/RiskEvaluator'

interface Props {
  decisionId:  string
  offeredOdds: number | null
  canPlaceBet?: boolean
}

export default function DecisionActions({ decisionId, offeredOdds, canPlaceBet = true }: Props) {
  const supabase = createClient()
  const router   = useRouter()

  const [saving,     setSaving]     = useState(false)
  const [error,      setError]      = useState('')
  const [stakeInput, setStakeInput] = useState('')
  const [showStake,  setShowStake]  = useState(false)
  const [showRisk,   setShowRisk]   = useState(false)

  function handleRiskCheck() {
    const stake = parseFloat(stakeInput)
    if (!stake || stake <= 0) { setError('Enter a valid stake amount'); return }
    setError('')
    setShowRisk(true)
  }

  async function handlePlaceBet() {
    const stake = parseFloat(stakeInput)
    setSaving(true)
    setError('')
    try {
      trackClientEvent(EVENTS.BET_PLACE_CLICKED, {
        decision_id:  decisionId,
        from_page:    'decision_detail',
        stake_bucket: bucketStake(stake),
        odds_bucket:  offeredOdds != null ? bucketOdds(offeredOdds) : null,
        is_ai_linked: true,
      })

      const { data: betData, error: betErr } = await supabase.rpc('place_bet_from_decision', {
        p_decision_id: decisionId,
        p_stake:       stake,
      })
      if (betErr) {
        const isDuplicate = betErr.code === '23505' || betErr.message?.includes('duplicate') || betErr.message?.includes('already placed')
        if (isDuplicate) {
          trackClientEvent(EVENTS.BET_DUPLICATE_REJECTED, { decision_id: decisionId, from_page: 'decision_detail' })
        } else {
          trackClientEvent(EVENTS.BET_PLACE_FAILED, { decision_id: decisionId, from_page: 'decision_detail' })
        }
        throw new Error(betErr.message || betErr.details || JSON.stringify(betErr))
      }
      const betPayload = betData as { bet_id?: string } | null
      trackClientEvent(EVENTS.BET_PLACE_SUCCEEDED, {
        bet_id:       betPayload?.bet_id,
        decision_id:  decisionId,
        bet_type:     'single',
        source:       'decision_detail',
        stake_bucket: bucketStake(stake),
        odds_bucket:  offeredOdds != null ? bucketOdds(offeredOdds) : null,
        is_ai_linked: true,
        is_parlay:    false,
        legs_count:   1,
      })
      trackClientEvent(EVENTS.DECISION_ACTION_PLACED, { decision_id: decisionId, from_page: 'decision_detail' })
      router.refresh()
    } catch (err: unknown) {
      trackClientEvent(EVENTS.DECISION_ACTION_FAILED, { decision_id: decisionId, action: 'placed', from_page: 'decision_detail' })
      setError(err instanceof Error ? err.message : String(err))
      setShowRisk(false)
    } finally {
      setSaving(false)
    }
  }

  async function handleAction(action: 'skipped' | 'watchlisted') {
    setSaving(true)
    setError('')
    try {
      const { error: actionErr } = await supabase.rpc('update_decision_action', {
        p_decision_id:  decisionId,
        p_final_action: action,
      })
      if (actionErr) throw new Error(actionErr.message || actionErr.details || JSON.stringify(actionErr))
      if (action === 'watchlisted') {
        trackClientEvent(EVENTS.DECISION_ACTION_WATCH, { decision_id: decisionId, from_page: 'decision_detail' })
      } else {
        trackClientEvent(EVENTS.DECISION_ACTION_SKIP, { decision_id: decisionId, from_page: 'decision_detail' })
      }
      router.refresh()
    } catch (err: unknown) {
      trackClientEvent(EVENTS.DECISION_ACTION_FAILED, { decision_id: decisionId, action, from_page: 'decision_detail' })
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Risk evaluator — shown after stake is entered */}
      {showStake && showRisk && (
        <RiskEvaluator
          stake={parseFloat(stakeInput)}
          decisionId={decisionId}
          fromPage="decision_detail"
          onConfirm={handlePlaceBet}
          onAdjustStake={() => setShowRisk(false)}
        />
      )}

      {/* Stake input */}
      {showStake && !showRisk && (
        <div className="card border border-indigo-800 flex flex-col gap-3">
          <p className="text-sm text-gray-300">
            Enter stake amount{offeredOdds ? ` (odds: ${offeredOdds})` : ''}:
          </p>
          <input
            className="input"
            type="number" step="0.01" min="0.01" placeholder="100"
            value={stakeInput}
            onChange={e => { setStakeInput(e.target.value); setError('') }}
            autoFocus
          />
          <div className="flex gap-2">
            <button className="btn-primary flex-1" onClick={handleRiskCheck} disabled={saving}>
              Check Risk
            </button>
            <button className="btn-ghost" onClick={() => { setShowStake(false); setStakeInput('') }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Initial action buttons */}
      {!showStake && (
        <div className="flex gap-3">
          {canPlaceBet && (
          <button
            className="btn-primary flex-1"
            onClick={() => {
              trackClientEvent(EVENTS.DECISION_ACTION_PLACE_CLICKED, {
                decision_id: decisionId,
                odds_bucket: offeredOdds != null ? bucketOdds(offeredOdds) : null,
                from_page:   'decision_detail',
              })
              setShowStake(true)
            }}
            disabled={saving}
          >
            ✅ Place Bet
          </button>
          )}
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
