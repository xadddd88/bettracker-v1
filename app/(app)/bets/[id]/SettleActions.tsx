'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { trackClientEvent } from '@/lib/analytics/client'
import { EVENTS } from '@/lib/analytics/events'
import { resolveBetStatus, type BetStatusKey } from '@/lib/bets/bet-status'
import { isSupportedSettlementStatus } from '@/lib/bets/settlement-metrics'
import { BroadcastButton, BroadcastPanel, BroadcastStatus } from '@/components/ui/BroadcastNoir'
import { formatMoney } from '@/lib/money'
import type { BroadcastNoirStatus } from '@/lib/ui/broadcast-noir'

interface Props {
  betId: string
  status: string
  pnl?: number | null
  settledAtLabel?: string
  currency: string
}

export default function SettleActions({ betId, status, pnl, settledAtLabel, currency }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError]     = useState('')
  const settlingRef = useRef(false)

  if (status !== 'pending') {
    const resolved = resolveBetStatus(status)
    return (
      <BroadcastPanel className="p-5 sm:p-7">
        <div className="editorial-kicker mb-3">Settlement</div>
        <div className="flex flex-wrap items-center gap-4">
          <BroadcastStatus status={statusTone(resolved.key)}>{resolved.label}</BroadcastStatus>
          {/* Settlement P&L is only defined for won/lost/void (Decision #058) */}
          {isSupportedSettlementStatus(status) && pnl != null && (
            <span className="bn-data-value text-sm font-black">
              {formatMoney(pnl, currency, true)}
            </span>
          )}
          {settledAtLabel && (
            <span className="text-xs text-bn-muted">
              {settledAtLabel}
            </span>
          )}
        </div>
      </BroadcastPanel>
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
    <BroadcastPanel className="p-5 sm:p-7">
      <div className="editorial-kicker mb-3">Settle bet</div>
      <p className="mb-4 text-sm leading-6 text-bn-muted">Choose the recorded outcome. The existing settlement contract remains the financial authority.</p>
      <div className="grid gap-2 min-[420px]:grid-cols-3">
        <BroadcastButton
          className="w-full"
          disabled={loading !== null}
          onClick={() => settle('won')}
        >
          {loading === 'won' ? '…' : 'Won'}
        </BroadcastButton>
        <BroadcastButton
          className="w-full"
          disabled={loading !== null}
          onClick={() => settle('lost')}
          tone="secondary"
        >
          {loading === 'lost' ? '…' : 'Lost'}
        </BroadcastButton>
        <BroadcastButton
          className="w-full"
          disabled={loading !== null}
          onClick={() => settle('void')}
          tone="secondary"
        >
          {loading === 'void' ? '…' : 'Void'}
        </BroadcastButton>
      </div>
      <div className="mt-5 border-t border-bn-border-strong pt-5">
        <BroadcastButton
          className="w-full"
          disabled={loading !== null}
          onClick={cancelBet}
          tone="destructive"
        >
          {loading === 'delete' ? 'Deleting…' : 'Delete bet and return stake'}
        </BroadcastButton>
        <p className="mt-2 text-[11px] leading-5 text-bn-muted">
          Available only while pending. The financial audit record is retained.
        </p>
      </div>
      {error && <p aria-live="polite" className="mt-3 text-xs font-semibold text-bn-negative">{error}</p>}
    </BroadcastPanel>
  )
}

function statusTone(status: BetStatusKey): BroadcastNoirStatus {
  if (status === 'won') return 'success'
  if (status === 'lost') return 'negative'
  if (status === 'pending' || status === 'partial') return 'review'
  return 'neutral'
}
