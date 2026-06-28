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

  return (
    <div className="stat-card flex flex-col gap-2">
      <div className="stat-label">Balance</div>
      <div className={`stat-value text-xl ${balance < 0 ? 'text-red-400' : 'text-white'}`}>
        {sym}{balance.toFixed(2)}
      </div>

      {!open ? (
        <button
          onClick={() => { setOpen(true); setType('deposit') }}
          className="mt-1 text-xs text-indigo-400 hover:text-indigo-300 transition-colors text-left"
        >
          + Add funds
        </button>
      ) : (
        <div className="flex flex-col gap-2 mt-1">
          {/* Deposit / Withdrawal toggle */}
          <div className="flex rounded-lg overflow-hidden border border-gray-700 text-xs">
            {(['deposit', 'withdrawal'] as const).map(t => (
              <button
                key={t}
                onClick={() => setType(t)}
                className={`flex-1 py-1 font-medium transition-colors capitalize ${
                  type === t
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:text-gray-200'
                }`}
              >
                {t === 'deposit' ? '↓ Deposit' : '↑ Withdraw'}
              </button>
            ))}
          </div>

          <input
            className="input text-sm py-1.5"
            type="number"
            min="0.01"
            step="0.01"
            placeholder="Amount"
            value={amount}
            onChange={e => { setAmount(e.target.value); setError('') }}
            autoFocus
          />

          <input
            className="input text-sm py-1.5"
            type="text"
            placeholder="Note (optional)"
            value={note}
            onChange={e => setNote(e.target.value)}
          />

          {error && (
            <p className="text-xs text-red-400">{error}</p>
          )}

          <div className="flex gap-2">
            <button
              onClick={submit}
              disabled={loading}
              className="btn-primary flex-1 text-xs py-1.5"
            >
              {loading ? '…' : 'Confirm'}
            </button>
            <button
              onClick={() => { setOpen(false); setAmount(''); setNote(''); setError('') }}
              className="btn-ghost text-xs py-1.5 px-3"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
