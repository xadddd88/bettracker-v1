'use client'

import { useEffect, useState } from 'react'
import { trackClientEvent } from '@/lib/analytics/client'
import { EVENTS } from '@/lib/analytics/events'
import { BroadcastButton, BroadcastDataValue, BroadcastPanel, BroadcastStatus } from '@/components/ui/BroadcastNoir'
import type { BroadcastNoirStatus } from '@/lib/ui/broadcast-noir'

interface RiskResult {
  risk_level:                'low' | 'medium' | 'high' | 'very_high'
  bankroll_balance:          number
  intended_exposure_amount:  number
  stake_percent_of_bankroll: number
  pending_exposure_amount:   number
  pending_exposure_percent:  number
  total_exposure_after_bet:  number
  warnings:                  string[]
  disclaimer:                string
}

interface Props {
  stake:         number
  decisionId?:   string
  fromPage:      string
  onAdjustStake: () => void
}

const RISK_CONFIG: Record<RiskResult['risk_level'], { label: string; status: BroadcastNoirStatus }> = {
  low:       { label: 'Low', status: 'neutral' },
  medium:    { label: 'Medium', status: 'review' },
  high:      { label: 'High', status: 'negative' },
  very_high: { label: 'Very High', status: 'negative' },
}

export default function RiskEvaluator({ stake, decisionId, fromPage, onAdjustStake }: Props) {
  const [result,     setResult]     = useState<RiskResult | null>(null)
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState('')

  useEffect(() => {
    let cancelled = false
    async function evaluate() {
      setLoading(true)
      setError('')
      try {
        const res  = await fetch('/api/risk/evaluate', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ stake, ...(decisionId ? { decision_id: decisionId } : {}) }),
        })
        const json = await res.json()
        if (!res.ok || !json.success) {
          if (!cancelled) setError(json.error ?? 'Risk check unavailable.')
          return
        }
        if (!cancelled) setResult(json.data as RiskResult)
      } catch {
        if (!cancelled) setError('Risk check unavailable.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    evaluate()
    return () => { cancelled = true }
  }, [stake, decisionId])

  useEffect(() => {
    if (result && result.warnings.length > 0) {
      trackClientEvent(EVENTS.RISK_WARNING_SHOWN, {
        risk_level:    result.risk_level,
        warning_count: result.warnings.length,
        from_page:     fromPage,
      })
    }
  }, [result, fromPage])

  if (loading) {
    return (
      <BroadcastPanel aria-live="polite" className="flex items-center gap-3 p-4"><BroadcastStatus status="neutral">Busy · evaluating risk</BroadcastStatus></BroadcastPanel>
    )
  }

  if (error || !result) {
    return (
      <BroadcastPanel className="flex flex-col gap-3 p-4">
        <BroadcastStatus className="w-full" status="review">{error || 'Risk check unavailable.'}</BroadcastStatus>
        <div className="flex gap-2">
          <BroadcastButton className="flex-1" tone="secondary"
            onClick={onAdjustStake}
          >
            Adjust Exposure
          </BroadcastButton>
        </div>
      </BroadcastPanel>
    )
  }

  const cfg         = RISK_CONFIG[result.risk_level]
  const hasWarnings = result.warnings.length > 0

  return (
    <BroadcastPanel className="flex flex-col gap-3 p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-bn-text">Risk Check</span>
        <BroadcastStatus status={cfg.status}>{cfg.label} Risk</BroadcastStatus>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="flex flex-col gap-0.5">
          <span className="text-xs text-bn-muted">Intended</span>
          <BroadcastDataValue className="text-sm font-semibold">
            {result.stake_percent_of_bankroll.toFixed(1)}%
          </BroadcastDataValue>
          <span className="text-xs text-bn-quiet">of bankroll</span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-xs text-bn-muted">Open bets</span>
          <BroadcastDataValue className="text-sm font-semibold">
            {result.pending_exposure_percent.toFixed(1)}%
          </BroadcastDataValue>
          <span className="text-xs text-bn-quiet">exposure</span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-xs text-bn-muted">Projected</span>
          <BroadcastDataValue className="text-sm font-semibold">
            {result.total_exposure_after_bet.toFixed(1)}%
          </BroadcastDataValue>
          <span className="text-xs text-bn-quiet">after action</span>
        </div>
      </div>

      {/* Warnings */}
      {hasWarnings && (
        <div className="flex flex-col gap-1.5">
          {result.warnings.map((w, i) => (
            <BroadcastStatus className="w-full" key={i} status="review">{w}</BroadcastStatus>
          ))}
        </div>
      )}

      {/* Total exposure line */}
      <p className="text-xs text-bn-muted">
        Total exposure after external action:{' '}
        <BroadcastDataValue className="font-medium">{result.total_exposure_after_bet.toFixed(1)}%</BroadcastDataValue> of bankroll
      </p>

      {/* Actions */}
      <div className="flex gap-2">
        <BroadcastButton className="flex-1" tone="secondary"
          onClick={() => {
            trackClientEvent(EVENTS.RISK_STAKE_ADJUSTED, {
              risk_level: result.risk_level,
              from_page:  fromPage,
            })
            onAdjustStake()
          }}
        >
          Adjust Exposure
        </BroadcastButton>
        <BroadcastButton className="flex-1" onClick={onAdjustStake}>Back</BroadcastButton>
      </div>

      {/* Disclaimer */}
      <p className="text-center text-xs text-bn-muted">{result.disclaimer}</p>
    </BroadcastPanel>
  )
}
