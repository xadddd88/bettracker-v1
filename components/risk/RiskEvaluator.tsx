'use client'

import { useEffect, useState } from 'react'
import { trackClientEvent } from '@/lib/analytics/client'
import { EVENTS } from '@/lib/analytics/events'

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
  onConfirm:     () => void
  onAdjustStake: () => void
}

const RISK_CONFIG: Record<RiskResult['risk_level'], { label: string; color: string; border: string; bg: string }> = {
  low:       { label: 'Low',       color: 'text-green-400',  border: 'border-green-800',  bg: 'bg-green-950/20'  },
  medium:    { label: 'Medium',    color: 'text-yellow-400', border: 'border-yellow-800', bg: 'bg-yellow-950/20' },
  high:      { label: 'High',      color: 'text-orange-400', border: 'border-orange-800', bg: 'bg-orange-950/20' },
  very_high: { label: 'Very High', color: 'text-red-400',    border: 'border-red-800',    bg: 'bg-red-950/20'    },
}

export default function RiskEvaluator({ stake, decisionId, fromPage, onConfirm, onAdjustStake }: Props) {
  const [result,     setResult]     = useState<RiskResult | null>(null)
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState('')
  const [confirming, setConfirming] = useState(false)

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
      <div className="card border border-gray-700 flex items-center gap-3 py-4">
        <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin shrink-0" />
        <span className="text-sm text-gray-400">Evaluating risk…</span>
      </div>
    )
  }

  // On fetch error: still let the user place
  if (error || !result) {
    return (
      <div className="card border border-gray-700 flex flex-col gap-3">
        <p className="text-xs text-gray-500">{error || 'Risk check unavailable.'}</p>
        <div className="flex gap-2">
          <button
            className="flex-1 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-medium transition-colors border border-gray-700"
            onClick={onAdjustStake}
          >
            Adjust Stake
          </button>
          <button className="btn-primary flex-1" onClick={onConfirm} disabled={confirming}>
            Place Bet
          </button>
        </div>
      </div>
    )
  }

  const cfg         = RISK_CONFIG[result.risk_level]
  const hasWarnings = result.warnings.length > 0

  return (
    <div className={`card border ${cfg.border} ${cfg.bg} flex flex-col gap-3`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-300">Risk Check</span>
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${cfg.color} ${cfg.border} bg-black/20`}>
          {cfg.label} Risk
        </span>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="flex flex-col gap-0.5">
          <span className="text-xs text-gray-500">Stake</span>
          <span className={`text-sm font-semibold ${cfg.color}`}>
            {result.stake_percent_of_bankroll.toFixed(1)}%
          </span>
          <span className="text-xs text-gray-600">of bankroll</span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-xs text-gray-500">Open bets</span>
          <span className="text-sm font-semibold text-gray-300">
            {result.pending_exposure_percent.toFixed(1)}%
          </span>
          <span className="text-xs text-gray-600">exposure</span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-xs text-gray-500">Suggested max</span>
          <span className="text-sm font-semibold text-gray-300">
            {result.recommended_max_stake}
          </span>
          <span className="text-xs text-gray-600">2% guideline</span>
        </div>
      </div>

      {/* Warnings */}
      {hasWarnings && (
        <div className="flex flex-col gap-1.5">
          {result.warnings.map((w, i) => (
            <div key={i} className="flex gap-2 text-xs text-yellow-300 bg-yellow-950/30 border border-yellow-900/60 rounded-lg px-3 py-2">
              <span className="shrink-0">⚠</span>
              <span>{w}</span>
            </div>
          ))}
        </div>
      )}

      {/* Total exposure line */}
      <p className="text-xs text-gray-500">
        Total exposure after bet:{' '}
        <span className="text-gray-300 font-medium">{result.total_exposure_after_bet.toFixed(1)}%</span> of bankroll
      </p>

      {/* Actions */}
      <div className="flex gap-2">
        <button
          className="flex-1 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-medium transition-colors border border-gray-700"
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
          className="flex-1 btn-primary"
          disabled={confirming}
          onClick={() => {
            if (confirming) return
            setConfirming(true)
            trackClientEvent(EVENTS.RISK_PLACE_ANYWAY_CLICKED, {
              risk_level:   result.risk_level,
              from_page:    fromPage,
              has_warnings: hasWarnings,
            })
            onConfirm()
          }}
        >
          {confirming ? '…' : 'Place anyway'}
        </button>
      </div>

      {/* Disclaimer */}
      <p className="text-xs text-gray-600 text-center">{result.disclaimer}</p>
    </div>
  )
}
