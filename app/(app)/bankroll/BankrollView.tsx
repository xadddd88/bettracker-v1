'use client'

import { useState, useCallback } from 'react'
import type { Bankroll, BankrollTransaction, TxnType } from '@/types'

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$', EUR: '€', UAH: '₴', GBP: '£', CAD: 'CA$', AUD: 'A$',
}

const TX_CONFIG: Record<TxnType, { icon: string; colorClass: string; label: string }> = {
  deposit:    { icon: '↑', colorClass: 'text-green-400',  label: 'Deposit' },
  withdrawal: { icon: '↓', colorClass: 'text-red-400',    label: 'Withdrawal' },
  stake:      { icon: '●', colorClass: 'text-gray-400',   label: 'Stake' },
  payout:     { icon: '✓', colorClass: 'text-green-400',  label: 'Payout' },
  adjustment: { icon: '±', colorClass: 'text-gray-400',   label: 'Adjustment' },
  bonus:      { icon: '★', colorClass: 'text-indigo-400', label: 'Bonus' },
}

function fmtBalance(amount: number, symbol: string): string {
  return `${symbol}${Math.abs(amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtDelta(amount: number, symbol: string): string {
  const sign = amount >= 0 ? '+' : '−'
  return `${sign}${symbol}${Math.abs(amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

interface Stats {
  totalDeposited: number
  totalWithdrawn: number
  netFromBets:    number
}

interface BankrollViewProps {
  bankroll:     Bankroll
  transactions: BankrollTransaction[]
  currency:     string
  stats:        Stats
}

export default function BankrollView({
  bankroll, transactions: initialTxs, currency, stats: initialStats,
}: BankrollViewProps) {
  const symbol = CURRENCY_SYMBOLS[currency] ?? currency

  const [balance,      setBalance]      = useState(bankroll.balance)
  const [transactions, setTransactions] = useState<BankrollTransaction[]>(initialTxs)
  const [stats,        setStats]        = useState<Stats>(initialStats)

  const [form,       setForm]       = useState<'deposit' | 'withdrawal' | null>(null)
  const [amount,     setAmount]     = useState('')
  const [note,       setNote]       = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError,  setFormError]  = useState('')

  const openForm = useCallback((type: 'deposit' | 'withdrawal') => {
    setForm(type)
    setAmount('')
    setNote('')
    setFormError('')
  }, [])

  const closeForm = useCallback(() => {
    setForm(null)
    setFormError('')
  }, [])

  const handleSubmit = useCallback(async () => {
    const amountNum = parseFloat(amount)
    if (isNaN(amountNum) || amountNum <= 0) {
      setFormError('Enter a valid positive amount')
      return
    }
    setFormError('')
    setSubmitting(true)

    try {
      const res = await fetch('/api/bankroll/deposit', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ amount: amountNum, type: form, note: note.trim() || undefined }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        setFormError(json.error ?? 'Transaction failed')
        return
      }

      const newBalance: number = json.balance
      const delta = form === 'deposit' ? amountNum : -amountNum

      const newTx: BankrollTransaction = {
        id:            crypto.randomUUID(),
        user_id:       bankroll.user_id,
        bankroll_id:   bankroll.id,
        type:          form!,
        amount:        delta,
        balance_after: newBalance,
        ...(note.trim() ? { metadata: { note: note.trim() } } : {}),
        created_at:    new Date().toISOString(),
      }

      setBalance(newBalance)
      setTransactions(prev => [newTx, ...prev])
      setStats(prev => ({
        totalDeposited: prev.totalDeposited + (form === 'deposit'    ? amountNum : 0),
        totalWithdrawn: prev.totalWithdrawn + (form === 'withdrawal' ? amountNum : 0),
        netFromBets:    prev.netFromBets,
      }))
      closeForm()
    } catch {
      setFormError('Network error — please try again')
    } finally {
      setSubmitting(false)
    }
  }, [amount, note, form, bankroll, closeForm])

  return (
    <div className="flex flex-col gap-6">
      {/* Balance */}
      <div className="card text-center py-8">
        <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Current Balance</p>
        <p className="text-4xl font-bold text-white">
          {symbol}{balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="stat-card">
          <p className="stat-label">Deposited</p>
          <p className="stat-value text-green-400">{fmtBalance(stats.totalDeposited, symbol)}</p>
        </div>
        <div className="stat-card">
          <p className="stat-label">Withdrawn</p>
          <p className="stat-value text-red-400">{fmtBalance(stats.totalWithdrawn, symbol)}</p>
        </div>
        <div className="stat-card">
          <p className="stat-label">Net from bets</p>
          <p className={`stat-value ${stats.netFromBets >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {stats.netFromBets >= 0 ? '+' : '−'}{symbol}{Math.abs(stats.netFromBets).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-3">
        <button
          className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
            form === 'deposit'
              ? 'bg-green-700 border-green-600 text-white'
              : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-500'
          }`}
          onClick={() => form === 'deposit' ? closeForm() : openForm('deposit')}
        >
          + Deposit
        </button>
        <button
          className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
            form === 'withdrawal'
              ? 'bg-red-800 border-red-700 text-white'
              : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-500'
          }`}
          onClick={() => form === 'withdrawal' ? closeForm() : openForm('withdrawal')}
        >
          − Withdraw
        </button>
      </div>

      {/* Inline form */}
      {form && (
        <div className="card flex flex-col gap-3">
          <p className="text-sm font-medium text-white capitalize">{form}</p>
          <div>
            <label className="label">Amount</label>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-gray-500 text-sm">{symbol}</span>
              <input
                className="input flex-1"
                type="number"
                min={0.01}
                step={0.01}
                placeholder="0.00"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                autoFocus
              />
            </div>
          </div>
          <div>
            <label className="label">
              Note <span className="text-gray-600 font-normal">(optional)</span>
            </label>
            <input
              className="input mt-1"
              type="text"
              maxLength={200}
              placeholder="e.g. Initial deposit"
              value={note}
              onChange={e => setNote(e.target.value)}
            />
          </div>
          {formError && (
            <p className="text-xs text-red-400 bg-red-950/40 border border-red-900 rounded-lg px-3 py-2">
              {formError}
            </p>
          )}
          <div className="flex gap-2">
            <button
              className="btn-primary flex-1"
              onClick={handleSubmit}
              disabled={submitting}
            >
              {submitting ? 'Processing…' : `Confirm ${form}`}
            </button>
            <button
              className="flex-1 py-2 rounded-lg text-sm font-medium border border-gray-700 text-gray-400 hover:border-gray-500 transition-colors"
              onClick={closeForm}
              disabled={submitting}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Transaction history */}
      <div>
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">
          Transaction history
        </p>
        {transactions.length === 0 ? (
          <div className="card flex flex-col items-center gap-3 py-10 text-center">
            <span className="text-3xl text-slate-600">—</span>
            <p className="text-sm font-medium text-gray-400">No transactions yet</p>
            <p className="text-xs text-gray-600">Make your first deposit to get started.</p>
            <button className="btn-primary mt-1" onClick={() => openForm('deposit')}>
              + Deposit
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {transactions.map(tx => {
              const cfg = TX_CONFIG[tx.type] ?? { icon: '?', colorClass: 'text-gray-400', label: tx.type }
              const noteStr = tx.metadata && typeof tx.metadata === 'object' && 'note' in tx.metadata
                ? String((tx.metadata as Record<string, unknown>).note)
                : null
              return (
                <div key={tx.id} className="card flex items-center gap-3">
                  <span className={`text-base w-5 text-center shrink-0 ${cfg.colorClass}`}>
                    {cfg.icon}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white">{cfg.label}</p>
                    {noteStr && (
                      <p className="text-[11px] text-gray-600 truncate">{noteStr}</p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`text-sm font-medium ${tx.amount >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {fmtDelta(tx.amount, symbol)}
                    </p>
                    <p className="text-[11px] text-gray-600">
                      {fmtBalance(tx.balance_after, symbol)} · {fmtDate(tx.created_at)}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
