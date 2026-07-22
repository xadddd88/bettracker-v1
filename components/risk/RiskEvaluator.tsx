'use client'

import { useEffect, useState } from 'react'
import { trackClientEvent } from '@/lib/analytics/client'
import { EVENTS } from '@/lib/analytics/events'
import { BroadcastStatus } from '@/components/ui/BroadcastNoir'

interface RiskResult {
  risk_level:                'low' | 'medium' | 'high' | 'very_high'
  stake_percent_of_bankroll: number
  pending_exposure_percent:  number
  total_exposure_after_bet:  number
  recommended_max_stake:     number
  warnings:                  string[]
  disclaimer:                string
}

interface Props {
  stake:         number
  decisionId?:   string
  fromPage:      string
  onConfirm:     () => Promise<void> | void
  onAdjustStake: () => void
}

const RISK_CONFIG: Record<RiskResult['risk_level'], { label: string; tone: 'negative' | 'neutral' | 'review' }> = {
  low:       { label: 'Low',       tone: 'neutral' },
  medium:    { label: 'Medium',    tone: 'review' },
  high:      { label: 'High',      tone: 'review' },
  very_high: { label: 'Very High', tone: 'negative' },
}

export default function RiskEvaluator({ stake, decisionId, fromPage, onConfirm, onAdjustStake }: Props) {
  const [result,     setResult]     = useState<RiskResult | null>(null)
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState('')
  const [confirming, setConfirming] = useState(false)

  async function handleConfirm(riskLevel?: string) {
    if (confirming) return
    setConfirming(true)
    trackClientEvent(EVENTS.RISK_PLACE_ANYWAY_CLICKED, {
      risk_level:   riskLevel ?? 'unavailable',
      from_page:    fromPage,
      has_warnings: result ? result.warnings.length > 0 : false,
    })
    try {
      await onConfirm()
    } finally {
      setConfirming(false)
    }
  }

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
      <div className="bn-panel flex items-center gap-3 px-4 py-4" role="status">
        <div className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-[var(--signal)] border-t-transparent" aria-hidden />
        <span className="text-sm text-[var(--text-muted)]">Evaluating risk…</span>
      </div>
    )
  }

  // On fetch error: still let the user place
  if (error || !result) {
    return (
      <div className="bn-panel flex flex-col gap-3 p-4">
        <BroadcastStatus status="review">Risk check unavailable</BroadcastStatus>
        <p className="text-xs text-[var(--text-muted)]">{error || 'Risk check unavailable.'}</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            className="bn-button bn-button-secondary w-full sm:flex-1"
            onClick={onAdjustStake}
          >
            Adjust Stake
          </button>
          <button className="bn-button bn-button-primary w-full sm:flex-1" onClick={() => handleConfirm()} disabled={confirming}>
            {confirming ? '…' : 'Place Bet'}
          </button>
        </div>
      </div>
    )
  }

  const cfg         = RISK_CONFIG[result.risk_level]
  const hasWarnings = result.warnings.length > 0

  return (
    <div className="bn-panel flex flex-col gap-4 p-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-bold text-[var(--text-primary)]">Risk Check</span>
        <BroadcastStatus status={cfg.tone}>{cfg.label} risk</BroadcastStatus>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-1 border border-[var(--border-strong)] text-left sm:grid-cols-3 sm:text-center">
        <div className="flex flex-col gap-1 border-b border-[var(--border-subtle)] p-3 sm:border-b-0 sm:border-r">
          <span className="text-xs text-[var(--text-muted)]">Stake</span>
          <span className="bn-data-value text-sm font-bold">
            {result.stake_percent_of_bankroll.toFixed(1)}%
          </span>
          <span className="text-xs text-[var(--text-quiet)]">of bankroll</span>
        </div>
        <div className="flex flex-col gap-1 border-b border-[var(--border-subtle)] p-3 sm:border-b-0 sm:border-r">
          <span className="text-xs text-[var(--text-muted)]">Open bets</span>
          <span className="bn-data-value text-sm font-bold">
            {result.pending_exposure_percent.toFixed(1)}%
          </span>
          <span className="text-xs text-[var(--text-quiet)]">exposure</span>
        </div>
        <div className="flex flex-col gap-1 p-3">
          <span className="text-xs text-[var(--text-muted)]">Suggested max</span>
          <span className="bn-data-value text-sm font-bold">
            {result.recommended_max_stake}
          </span>
          <span className="text-xs text-[var(--text-quiet)]">2% guideline</span>
        </div>
      </div>

      {/* Warnings */}
      {hasWarnings && (
        <div className="flex flex-col gap-1.5">
          {result.warnings.map((w, i) => (
            <div key={i} className="flex gap-2 border border-[var(--review)] bg-[var(--field-raised)] px-3 py-2 text-xs text-[var(--review)]">
              <span className="shrink-0" aria-hidden>!</span>
              <span>{w}</span>
            </div>
          ))}
        </div>
      )}

      {/* Total exposure line */}
      <p className="text-xs text-[var(--text-muted)]">
        Total exposure after bet:{' '}
        <span className="bn-data-value font-bold">{result.total_exposure_after_bet.toFixed(1)}%</span> of bankroll
      </p>

      {/* Actions */}
      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          className="bn-button bn-button-secondary w-full sm:flex-1"
          onClick={() => {
            trackClientEvent(EVENTS.RISK_STAKE_ADJUSTED, {
              risk_level: result.risk_level,
              from_page:  fromPage,
            })
            onAdjustStake()
          }}
        >
          Adjust Stake
        </button>
        <button
          className="bn-button bn-button-primary w-full sm:flex-1"
          disabled={confirming}
          onClick={() => handleConfirm(result.risk_level)}
        >
          {confirming ? '…' : 'Place anyway'}
        </button>
      </div>

      {/* Disclaimer */}
      <p className="text-center text-xs text-[var(--text-quiet)]">{result.disclaimer}</p>
    </div>
  )
}
