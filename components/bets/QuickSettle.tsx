'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { trackClientEvent } from '@/lib/analytics/client'
import { EVENTS } from '@/lib/analytics/events'
import { BroadcastButton } from '@/components/ui/BroadcastNoir'

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
      if (res.status === 409) { setError('Ставка уже рассчитана'); return }
      if (!res.ok || !json.success) { setError(json.error ?? 'Не удалось рассчитать ставку'); return }
      router.refresh()
    } catch {
      setError('Ошибка сети — попробуйте ещё раз')
    } finally {
      lockRef.current = false
      setBusy(null)
    }
  }

  async function cancelBet() {
    if (lockRef.current) return
    if (!window.confirm('Удалить эту открытую ставку? Сумма вернётся в банкролл. Действие нельзя отменить.')) return

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
      if (!res.ok || !json.success) { setError(json.error ?? 'Не удалось удалить ставку'); return }
      router.refresh()
    } catch {
      setError('Ошибка сети — попробуйте ещё раз')
    } finally {
      lockRef.current = false
      setBusy(null)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-bn-border-strong bg-bn-night px-4 py-3 sm:px-6">
      <span className="shrink-0 basis-full font-mono text-[11px] font-bold uppercase tracking-[0.06em] text-bn-quiet sm:basis-auto">Записать итог</span>
      <BroadcastButton
        className="min-h-11 px-3"
        onClick={() => settle('won')}
        disabled={busy !== null}
      >
        {busy === 'won' ? '…' : 'Выиграла'}
      </BroadcastButton>
      <BroadcastButton
        className="min-h-11 px-3"
        onClick={() => settle('lost')}
        disabled={busy !== null}
        tone="secondary"
      >
        {busy === 'lost' ? '…' : 'Проиграла'}
      </BroadcastButton>
      <BroadcastButton
        className="min-h-11 px-3"
        onClick={() => settle('void')}
        disabled={busy !== null}
        tone="secondary"
      >
        {busy === 'void' ? '…' : 'Возврат'}
      </BroadcastButton>
      <BroadcastButton
        className="min-h-11 px-3 sm:ml-auto"
        onClick={cancelBet}
        disabled={busy !== null}
        tone="destructive"
      >
        {busy === 'delete' ? 'Удаляем…' : 'Удалить'}
      </BroadcastButton>
      {error && <span aria-live="polite" className="basis-full text-[11px] font-semibold text-bn-negative sm:ml-1 sm:basis-auto">{error}</span>}
    </div>
  )
}
