'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { trackClientEvent } from '@/lib/analytics/client'
import { EVENTS } from '@/lib/analytics/events'
import RiskEvaluator from '@/components/risk/RiskEvaluator'
import {
  BroadcastButton,
  BroadcastPanel,
  BroadcastStatus,
} from '@/components/ui/BroadcastNoir'

interface Props {
  decisionId: string
  offeredOdds: number | null
  canCheckRisk?: boolean
  canWatch?: boolean
  labels?: {
    riskCheck?: string
    watch?: string
    skip?: string
    checkRisk?: string
    cancel?: string
    stakePrompt?: string
    invalidStake?: string
    helper?: string
  }
}

export default function DecisionActions({
  decisionId,
  offeredOdds,
  canCheckRisk = true,
  canWatch = true,
  labels,
}: Props) {
  const supabase = createClient()
  const router = useRouter()

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [stakeInput, setStakeInput] = useState('')
  const [showStake, setShowStake] = useState(false)
  const [showRisk, setShowRisk] = useState(false)

  function handleRiskCheck() {
    const stake = parseFloat(stakeInput)
    if (!stake || stake <= 0) {
      setError(labels?.invalidStake ?? 'Enter a valid stake amount')
      return
    }
    setError('')
    setShowRisk(true)
  }

  async function handleAction(action: 'skipped' | 'watchlisted') {
    setSaving(true)
    setError('')
    try {
      const { error: actionErr } = await supabase.rpc('update_decision_action', {
        p_decision_id: decisionId,
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
      {showStake && showRisk && (
        <RiskEvaluator
          stake={parseFloat(stakeInput)}
          decisionId={decisionId}
          fromPage="decision_detail"
          onAdjustStake={() => setShowRisk(false)}
        />
      )}

      {showStake && !showRisk && (
        <BroadcastPanel className="flex flex-col gap-3 border-bn-review p-4">
          <label className="text-sm text-bn-muted" htmlFor="decision-stake">
            {labels?.stakePrompt ?? 'Enter intended exposure'}{offeredOdds ? ` (odds: ${offeredOdds})` : ''}:
          </label>
          <input
            id="decision-stake"
            className="input"
            type="number"
            step="0.01"
            min="0.01"
            placeholder="100"
            value={stakeInput}
            onChange={e => { setStakeInput(e.target.value); setError('') }}
            autoFocus
          />
          <div className="flex flex-col gap-2 sm:flex-row">
            <BroadcastButton className="w-full sm:flex-1" onClick={handleRiskCheck} disabled={saving}>
              {labels?.checkRisk ?? 'Check Risk'}
            </BroadcastButton>
            <BroadcastButton tone="secondary" className="w-full sm:w-auto" onClick={() => { setShowStake(false); setStakeInput('') }}>
              {labels?.cancel ?? 'Cancel'}
            </BroadcastButton>
          </div>
        </BroadcastPanel>
      )}

      {!showStake && (
        <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
          {canCheckRisk && (
            <BroadcastButton
              className="w-full sm:flex-1"
              onClick={() => {
                setShowStake(true)
              }}
              disabled={saving}
            >
              {labels?.riskCheck ?? 'Check Risk'}
            </BroadcastButton>
          )}
          {canWatch && (
            <BroadcastButton
              tone="secondary"
              className="w-full sm:flex-1"
              onClick={() => handleAction('watchlisted')}
              disabled={saving}
            >
              {labels?.watch ?? 'Watch'}
            </BroadcastButton>
          )}
          <BroadcastButton
            tone="secondary"
            className="w-full sm:flex-1"
            onClick={() => handleAction('skipped')}
            disabled={saving}
          >
            {labels?.skip ?? 'Skip'}
          </BroadcastButton>
        </div>
      )}

      {error && (
        <BroadcastStatus className="w-full" status="negative">{error}</BroadcastStatus>
      )}

      <p className="text-center text-xs text-bn-quiet">
        {labels?.helper ?? 'Skipping or watching is a valid decision - it will be saved to your history.'}
      </p>
    </div>
  )
}
