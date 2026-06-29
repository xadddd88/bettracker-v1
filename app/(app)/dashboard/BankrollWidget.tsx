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
    <div className="relative bg-night-900 border border-night-700 rounded-xl p-5 overflow-hidden">
      {/* Amber accent line — the ledger highlight */}
      <div className="absolute inset-x-0 top-0 h-[2px] bg-amber-500 rounded-t-xl" />

      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <div className="stat-label">Balance</div>
          <div className={`text-5xl font-bold font-mono mt-2 tracking-tight leading-none ${balance < 0 ? 'text-red-400' : 'text-white'}`}>
            {sym}{balance.toFixed(2)}
          </div>
        </div>

        {!open && (
          <div className="flex gap-2 pb-0.5">
            <button
              onClick={() => { setOpen(true); setType('deposit') }}
              className="btn-ghost text-xs"
            >
              Deposit
            </button>
            <button
              onClick={() => { setOpen(true); setType('withdrawal') }}
              className="btn-ghost text-xs"
            >
              Withdraw
            </button>
          </div>
        )}
      </div>

      {open && (
        <div className="mt-4 pt-4 border-t border-night-700 flex flex-col gap-3">
          <div className="flex rounded-lg overflow-hidden border border-night-700 text-xs w-fit">
            {(['deposit', 'withdrawal'] as const).map(t => (
              <button
                key={t}
                onClick={() => setType(t)}
                className={`px-4 py-1.5 font-medium transition-colors capitalize ${
                  type === t
                    ? 'bg-amber-500 text-night-950'
                    : 'bg-night-800 text-slate-400 hover:text-white'
                }`}
              >
                {t === 'deposit' ? 'Deposit' : 'Withdraw'}
              </button>
            ))}
          </div>

          <div className="flex gap-3 flex-wrap items-start">
            <input
              className="input text-sm py-1.5 w-36"
              type="number"
              min="0.01"
              step="0.01"
              placeholder="Amount"
              value={amount}
              onChange={e => { setAmount(e.target.value); setError('') }}
              autoFocus
            />
            <input
              className="input text-sm py-1.5 flex-1 min-w-36"
              type="text"
              placeholder="Note (optional)"
              value={note}
              onChange={e => setNote(e.target.value)}
            />
            <div className="flex gap-2">
              <button
                onClick={submit}
                disabled={loading}
                className="btn-primary text-xs py-1.5 px-4"
              >
                {loading ? '…' : 'Confirm'}
              </button>
              <button onClick={close} className="btn-ghost text-xs py-1.5 px-3">
                Cancel
              </button>
            </div>
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
      )}
    </div>
  )
}
