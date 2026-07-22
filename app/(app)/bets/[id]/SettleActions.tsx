'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Check, RotateCcw, Trash2, X } from 'lucide-react'

import { trackClientEvent } from '@/lib/analytics/client'
import { EVENTS } from '@/lib/analytics/events'
import { resolveBetStatus, type BetStatusKey } from '@/lib/bets/bet-status'
import { isSupportedSettlementStatus } from '@/lib/bets/settlement-metrics'
import { BroadcastStatus } from '@/components/ui/BroadcastNoir'

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
      <section className="border-y border-[var(--border-strong)] py-5">
        <h2 className="font-mono text-[11px] font-black uppercase tracking-[0.12em] text-[var(--text-quiet)]">Settlement</h2>
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <BroadcastStatus status={statusTone(resolved.key)}>{resolved.label}</BroadcastStatus>
          {/* Settlement P&L is only defined for won/lost/void (Decision #058) */}
          {isSupportedSettlementStatus(status) && pnl != null && (
            <span className={`font-mono text-sm font-bold tabular-nums ${pnl >= 0 ? 'text-[var(--success)]' : 'text-[var(--negative)]'}`}>
              {pnl >= 0 ? '+' : ''}{sym}{pnl.toFixed(2)}
            </span>
          )}
          {settledAt && (
            <span className="text-xs text-[var(--text-quiet)]">
              {new Date(settledAt).toLocaleDateString('en-GB', {
                day: '2-digit', month: 'short', year: 'numeric',
                hour: '2-digit', minute: '2-digit',
              })}
            </span>
          )}
        </div>
      </section>
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
    <section className="border-y border-[var(--border-strong)] py-5">
      <h2 className="font-mono text-[11px] font-black uppercase tracking-[0.12em] text-[var(--text-quiet)]">Settle bet</h2>
      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <button
          className="btn-primary w-full"
          disabled={loading !== null}
          onClick={() => settle('won')}
        >
          <Check aria-hidden="true" className="h-4 w-4" /> {loading === 'won' ? 'Settling…' : 'Won'}
        </button>
        <button
          className="btn-ghost w-full"
          disabled={loading !== null}
          onClick={() => settle('lost')}
        >
          <X aria-hidden="true" className="h-4 w-4" /> {loading === 'lost' ? 'Settling…' : 'Lost'}
        </button>
        <button
          className="btn-ghost w-full"
          disabled={loading !== null}
          onClick={() => settle('void')}
        >
          <RotateCcw aria-hidden="true" className="h-4 w-4" /> {loading === 'void' ? 'Settling…' : 'Void'}
        </button>
      </div>
      <div className="mt-5 border-t border-[var(--border-subtle)] pt-5">
        <button
          className="bn-button bn-button-destructive w-full"
          disabled={loading !== null}
          onClick={cancelBet}
        >
          <Trash2 aria-hidden="true" className="h-4 w-4" /> {loading === 'delete' ? 'Deleting…' : 'Delete bet and return stake'}
        </button>
        <p className="mt-2 text-[11px] text-[var(--text-quiet)]">
          Available only while pending. The financial audit record is retained.
        </p>
      </div>
      {error && <p className="mt-3 border border-[var(--negative)] p-3 text-xs text-[var(--negative)]" role="alert">{error}</p>}
    </section>
  )
}

function statusTone(status: BetStatusKey): 'negative' | 'neutral' | 'review' | 'success' {
  if (status === 'won') return 'success'
  if (status === 'lost') return 'negative'
  if (status === 'pending') return 'review'
  return 'neutral'
}
