'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Check, RotateCcw, Trash2, X } from 'lucide-react'

import { trackClientEvent } from '@/lib/analytics/client'
import { EVENTS } from '@/lib/analytics/events'

interface Props {
  betId: string
}

export default function QuickSettle({ betId }: Props) {
  const router   = useRouter()
  const [busy,  setBusy]  = useState<'won' | 'lost' | 'void' | 'delete' | null>(null)
  const [error, setError] = useState('')
  const lockRef = useRef(false)

  async function settle(outcome: 'won' | 'lost' | 'void') {
    if (lockRef.current) return
    lockRef.current = true
    setBusy(outcome)
    setError('')
    trackClientEvent(EVENTS.BET_SETTLE_CLICKED, { bet_id: betId, outcome, from_page: 'quick_settle' })
    try {
      const res  = await fetch(`/api/bets/${betId}/settle`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ outcome }),
      })
      const json = await res.json()
      if (res.status === 409) { setError('Already settled'); return }
      if (!res.ok || !json.success) { setError(json.error ?? 'Settlement failed'); return }
      router.refresh()
    } catch {
      setError('Network error — try again')
    } finally {
      lockRef.current = false
      setBusy(null)
    }
  }

  async function cancelBet() {
    if (lockRef.current) return
    if (!window.confirm('Delete this pending bet? The stake will be returned to your bankroll. This cannot be undone.')) return

    lockRef.current = true
    setBusy('delete')
    setError('')
    trackClientEvent(EVENTS.BET_CANCEL_CLICKED, { bet_id: betId, from_page: 'tracker_list' })
    try {
      const res = await fetch(`/api/bets/${betId}/cancel`, {
        method: 'POST',
        headers: { 'Idempotency-Key': crypto.randomUUID() },
      })
      const json = await res.json()
      if (!res.ok || !json.success) { setError(json.error ?? 'Bet could not be deleted'); return }
      router.refresh()
    } catch {
      setError('Network error — try again')
    } finally {
      lockRef.current = false
      setBusy(null)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-[var(--border-subtle)] bg-[var(--field)] px-4 py-3">
      <span className="basis-full shrink-0 font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-quiet)] sm:basis-auto">Settle</span>
      <button
        className="bn-button bn-button-secondary min-h-11 text-[var(--success)]"
        onClick={() => settle('won')}
        disabled={busy !== null}
      >
        <Check aria-hidden="true" className="h-4 w-4" /> {busy === 'won' ? '…' : 'Won'}
      </button>
      <button
        className="bn-button bn-button-secondary min-h-11 text-[var(--negative)]"
        onClick={() => settle('lost')}
        disabled={busy !== null}
      >
        <X aria-hidden="true" className="h-4 w-4" /> {busy === 'lost' ? '…' : 'Lost'}
      </button>
      <button
        className="bn-button bn-button-secondary min-h-11 text-[var(--text-muted)]"
        onClick={() => settle('void')}
        disabled={busy !== null}
      >
        <RotateCcw aria-hidden="true" className="h-4 w-4" /> {busy === 'void' ? '…' : 'Void'}
      </button>
      <button
        className="bn-button bn-button-destructive min-h-11 sm:ml-auto"
        onClick={cancelBet}
        disabled={busy !== null}
      >
        <Trash2 aria-hidden="true" className="h-4 w-4" /> {busy === 'delete' ? 'Deleting…' : 'Delete'}
      </button>
      {error && <span className="basis-full text-[11px] text-[var(--negative)] sm:ml-1" role="alert">{error}</span>}
    </div>
  )
}
