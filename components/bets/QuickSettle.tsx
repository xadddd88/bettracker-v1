'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { trackClientEvent } from '@/lib/analytics/client'
import { EVENTS } from '@/lib/analytics/events'

interface Props {
  betId: string
}

export default function QuickSettle({ betId }: Props) {
  const router   = useRouter()
  const [busy,  setBusy]  = useState<'won' | 'lost' | 'void' | null>(null)
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

  return (
    <div className="flex items-center gap-2 px-4 py-2.5 bg-gray-900/60 border-t border-gray-800/60">
      <span className="text-[11px] text-gray-600 shrink-0">Settle:</span>
      <button
        className="px-3 py-1 rounded-md text-xs font-medium bg-green-950 border border-green-900 text-green-400 hover:bg-green-900 transition-colors disabled:opacity-40"
        onClick={() => settle('won')}
        disabled={busy !== null}
      >
        {busy === 'won' ? '…' : 'Won'}
      </button>
      <button
        className="px-3 py-1 rounded-md text-xs font-medium bg-gray-800 border border-gray-700 text-gray-300 hover:bg-gray-700 transition-colors disabled:opacity-40"
        onClick={() => settle('lost')}
        disabled={busy !== null}
      >
        {busy === 'lost' ? '…' : 'Lost'}
      </button>
      <button
        className="px-3 py-1 rounded-md text-xs font-medium bg-gray-800 border border-gray-700 text-gray-500 hover:bg-gray-700 transition-colors disabled:opacity-40"
        onClick={() => settle('void')}
        disabled={busy !== null}
      >
        {busy === 'void' ? '…' : 'Void'}
      </button>
      {error && <span className="text-[10px] text-red-400 ml-1">{error}</span>}
    </div>
  )
}
