'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { trackClientEvent } from '@/lib/analytics/client'
import { EVENTS } from '@/lib/analytics/events'
import { resolveBetStatus, type BetStatusKey } from '@/lib/bets/bet-status'
import { isSupportedSettlementStatus } from '@/lib/bets/settlement-metrics'

// Canonical resolver keys (Decision #058): explicit color for every status,
// including 'partial' and 'unknown' — no raw text, no misleading fallback.
const STATUS_TEXT: Record<BetStatusKey, string> = {
  won:        'text-green-400',
  lost:       'text-red-400',
  pending:    'text-yellow-400',
  void:       'text-gray-400',
  push:       'text-blue-400',
  cashed_out: 'text-purple-400',
  partial:    'text-slate-300',
  unknown:    'text-slate-500',
}

interface Props {
  betId: string
  status: string
  pnl?: number | null
  settledAt?: string
  sym: string
}

export default function SettleActions({ betId, status, pnl, settledAt, sym }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError]     = useState('')
  const settlingRef = useRef(false)

  if (status !== 'pending') {
    const resolved = resolveBetStatus(status)
    return (
      <div className="card">
        <div className="stat-label mb-2">Settlement</div>
        <div className="flex items-center gap-4 flex-wrap">
          <span className={`font-semibold ${STATUS_TEXT[resolved.key]}`}>{resolved.label}</span>
          {/* Settlement P&L is only defined for won/lost/void (Decision #058) */}
          {isSupportedSettlementStatus(status) && pnl != null && (
            <span className={`text-sm font-bold ${pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {pnl >= 0 ? '+' : ''}{sym}{pnl.toFixed(2)}
            </span>
          )}
          {settledAt && (
            <span className="text-xs text-gray-600">
              {new Date(settledAt).toLocaleDateString('en-GB', {
                day: '2-digit', month: 'short', year: 'numeric',
                hour: '2-digit', minute: '2-digit',
              })}
            </span>
          )}
        </div>
      </div>
    )
  }

  async function settle(outcome: 'won' | 'lost' | 'void') {
    if (settlingRef.current) return
    settlingRef.current = true
    trackClientEvent(EVENTS.BET_SETTLE_CLICKED, { bet_id: betId, outcome })
    setLoading(outcome)
    setError('')
    try {
      const res = await fetch(`/api/bets/${betId}/settle`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ outcome }),
      })
      const json = await res.json()
      if (res.status === 409) {
        trackClientEvent(EVENTS.BET_SETTLE_DUPLICATE_REJECTED, { bet_id: betId, outcome })
        setError(json.error ?? 'Already settled')
        return
      }
      if (!res.ok || !json.success) {
        setError(json.error ?? 'Settlement failed')
        return
      }
      router.refresh()
    } catch {
      setError('Network error')
    } finally {
      settlingRef.current = false
      setLoading(null)
    }
  }

  async function cancelBet() {
    if (settlingRef.current) return
    if (!window.confirm('Delete this pending bet? The stake will be returned to your bankroll. This cannot be undone.')) return

    settlingRef.current = true
    trackClientEvent(EVENTS.BET_CANCEL_CLICKED, { bet_id: betId, from_page: 'bet_detail' })
    setLoading('delete')
    setError('')
    try {
      const res = await fetch(`/api/bets/${betId}/cancel`, {
        method: 'POST',
        headers: { 'Idempotency-Key': crypto.randomUUID() },
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        setError(json.error ?? 'Bet could not be deleted')
        return
      }
      router.replace('/bets')
      router.refresh()
    } catch {
      setError('Network error — try again')
    } finally {
      settlingRef.current = false
      setLoading(null)
    }
  }

  return (
    <div className="card">
      <div className="stat-label mb-3">Settle bet</div>
      <div className="flex gap-3">
        <button
          className="btn-primary flex-1"
          disabled={loading !== null}
          onClick={() => settle('won')}
        >
          {loading === 'won' ? '…' : 'Won'}
        </button>
        <button
          className="btn-ghost flex-1"
          disabled={loading !== null}
          onClick={() => settle('lost')}
        >
          {loading === 'lost' ? '…' : 'Lost'}
        </button>
        <button
          className="btn-ghost flex-1"
          disabled={loading !== null}
          onClick={() => settle('void')}
        >
          {loading === 'void' ? '…' : 'Void'}
        </button>
      </div>
      <div className="mt-4 border-t border-gray-800 pt-4">
        <button
          className="min-h-11 w-full border border-red-900 bg-red-950/40 px-4 py-2 text-sm font-medium text-red-300 transition-colors hover:bg-red-950 disabled:opacity-40"
          disabled={loading !== null}
          onClick={cancelBet}
        >
          {loading === 'delete' ? 'Deleting…' : 'Delete bet and return stake'}
        </button>
        <p className="mt-2 text-[11px] text-gray-600">
          Available only while pending. The financial audit record is retained.
        </p>
      </div>
      {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
    </div>
  )
}
