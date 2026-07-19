'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  balance: number
  sym: string
}

export default function BankrollWidget({ balance, sym }: Props) {
  const router = useRouter()
  const [open,    setOpen]    = useState(false)
  const [type,    setType]    = useState<'deposit' | 'withdrawal'>('deposit')
  const [amount,  setAmount]  = useState('')
  const [note,    setNote]    = useState('')
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  async function submit() {
    const num = parseFloat(amount)
    if (!num || num <= 0) { setError('Enter a valid amount'); return }

    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/bankroll/deposit', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ amount: num, type, note: note.trim() || undefined }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) { setError(json.error ?? 'Failed'); return }
      setOpen(false)
      setAmount('')
      setNote('')
      router.refresh()
    } catch {
      setError('Network error')
    } finally {
      setLoading(false)
    }
  }

  function close() {
    setOpen(false)
    setAmount('')
    setNote('')
    setError('')
  }

  return (
    <div className="relative overflow-hidden">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <div className="font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-black/45">Available bankroll</div>
          <div className={`mt-3 font-display text-[clamp(3.4rem,9vw,7.8rem)] font-black leading-[0.82] tracking-[-0.075em] ${balance < 0 ? 'text-red-700' : 'text-black'}`}>
            {sym}{balance.toFixed(2)}
          </div>
        </div>

        {!open && (
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => { setOpen(true); setType('deposit') }}
              className="btn-ghost"
            >
              Deposit
            </button>
            <button
              onClick={() => { setOpen(true); setType('withdrawal') }}
              className="btn-ghost"
            >
              Withdraw
            </button>
          </div>
        )}
      </div>

      {open && (
        <div className="mt-8 flex flex-col gap-4 border-t border-black pt-5">
          <div className="flex w-fit border border-black text-xs">
            {(['deposit', 'withdrawal'] as const).map(t => (
              <button
                key={t}
                onClick={() => setType(t)}
                className={`min-h-11 px-4 font-black uppercase tracking-[0.08em] transition-colors ${
                  type === t
                    ? 'editorial-dark bg-[#050505] text-white'
                    : 'bg-white text-black hover:bg-[#e8ff00]'
                }`}
              >
                {t === 'deposit' ? 'Deposit' : 'Withdraw'}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-start gap-3">
            <input
              className="input w-40 text-sm"
              type="number"
              min="0.01"
              step="0.01"
              placeholder="Amount"
              value={amount}
              onChange={e => { setAmount(e.target.value); setError('') }}
              autoFocus
            />
            <input
              className="input min-w-40 flex-1 text-sm"
              type="text"
              placeholder="Note (optional)"
              value={note}
              onChange={e => setNote(e.target.value)}
            />
            <div className="flex flex-wrap gap-2">
              <button
                onClick={submit}
                disabled={loading}
                className="btn-primary"
              >
                {loading ? '…' : 'Confirm'}
              </button>
              <button onClick={close} className="btn-ghost">
                Cancel
              </button>
            </div>
          </div>

          {error && <p className="text-xs font-semibold text-red-700">{error}</p>}
        </div>
      )}
    </div>
  )
}
