'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import type { Bankroll, BankrollTransaction, TxnType } from '@/types'

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$', EUR: '€', UAH: '₴', GBP: '£', CAD: 'CA$', AUD: 'A$',
}

const TX_CONFIG: Record<TxnType, { icon: string; colorClass: string; label: string }> = {
  deposit:    { icon: '↑', colorClass: 'text-[var(--success)]', label: 'Deposit' },
  withdrawal: { icon: '↓', colorClass: 'text-[var(--negative)]', label: 'Withdrawal' },
  stake:      { icon: '●', colorClass: 'text-[var(--text-muted)]', label: 'Stake' },
  payout:     { icon: '✓', colorClass: 'text-[var(--success)]', label: 'Payout' },
  adjustment: { icon: '±', colorClass: 'text-[var(--text-muted)]', label: 'Adjustment' },
  bonus:      { icon: '★', colorClass: 'text-[var(--text-primary)]', label: 'Bonus' },
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
  const router = useRouter()
  const symbol = CURRENCY_SYMBOLS[currency] ?? currency

  const [balance,      setBalance]      = useState(bankroll.balance)
  const [transactions, setTransactions] = useState<BankrollTransaction[]>(initialTxs)
  const [stats,        setStats]        = useState<Stats>(initialStats)

  const [form,       setForm]       = useState<'deposit' | 'withdrawal' | null>(null)
  const [amount,     setAmount]     = useState('')
  const [note,       setNote]       = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError,  setFormError]  = useState('')
  // One key per form session: a retry after a network error reuses it,
  // so the server-side idempotency guard can never double-apply.
  const [idemKey,    setIdemKey]    = useState('')

  const openForm = useCallback((type: 'deposit' | 'withdrawal') => {
    setForm(type)
    setAmount('')
    setNote('')
    setFormError('')
    setIdemKey(crypto.randomUUID())
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
        body:    JSON.stringify({
          amount: amountNum,
          type: form,
          note: note.trim() || undefined,
          idempotency_key: idemKey || undefined,
        }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        setFormError(json.error ?? 'Transaction failed')
        return
      }

      if (json.replayed) {
        // The server already applied this exact request earlier — do not
        // append a duplicate row or move the stats; re-read server truth.
        closeForm()
        router.refresh()
        return
      }

      const newBalance: number = json.balance
      const delta = form === 'deposit' ? amountNum : -amountNum

      const newTx: BankrollTransaction = {
        id:            json.transaction_id ?? crypto.randomUUID(),
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
  }, [amount, note, form, bankroll, idemKey, closeForm, router])

  return (
    <div className="bn-page flex flex-col gap-6">
      {/* Balance */}
      <div className="bn-panel px-5 py-8 text-center">
        <p className="editorial-kicker mb-2">Current Balance</p>
        <p className="bn-data-value font-display text-4xl font-black">
          {symbol}{balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </p>
        <p className="mt-2 text-xs text-[var(--text-muted)]">Deposits + payouts − stakes − withdrawals</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="stat-card">
          <p className="stat-label">Deposited</p>
          <p className="stat-value text-[var(--success)]">+ {fmtBalance(stats.totalDeposited, symbol)}</p>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">total added</p>
        </div>
        <div className="stat-card">
          <p className="stat-label">Withdrawn</p>
          <p className="stat-value text-[var(--negative)]">− {fmtBalance(stats.totalWithdrawn, symbol)}</p>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">total removed</p>
        </div>
        <div className="stat-card">
          <p className="stat-label">Net from bets</p>
          <p className={`stat-value ${stats.netFromBets >= 0 ? 'text-[var(--success)]' : 'text-[var(--negative)]'}`}>
            {stats.netFromBets >= 0 ? '+' : '−'}{symbol}{Math.abs(stats.netFromBets).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">payouts minus stakes</p>
        </div>
      </div>
      <p className="-mt-2 text-center text-xs text-[var(--text-muted)]">Pending bet stakes are not automatically deducted from your balance.</p>

      {/* Action buttons */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <button
          className={`bn-button w-full sm:flex-1 ${
            form === 'deposit'
              ? 'border-[var(--success)] text-[var(--success)]'
              : 'bn-button-secondary'
          }`}
          onClick={() => form === 'deposit' ? closeForm() : openForm('deposit')}
        >
          + Deposit
        </button>
        <button
          className={`bn-button w-full sm:flex-1 ${
            form === 'withdrawal'
              ? 'bn-button-destructive'
              : 'bn-button-secondary'
          }`}
          onClick={() => form === 'withdrawal' ? closeForm() : openForm('withdrawal')}
        >
          − Withdraw
        </button>
      </div>

      {/* Inline form */}
      {form && (
        <div className="bn-panel flex flex-col gap-3 p-4 sm:p-5">
          <p className="editorial-kicker capitalize">{form}</p>
          <div>
            <label className="label">Amount</label>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-sm text-[var(--text-muted)]">{symbol}</span>
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
              Note <span className="font-normal text-[var(--text-muted)]">(optional)</span>
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
            <p className="bn-status bn-status-negative w-full justify-start" role="alert">
              <span className="bn-status-icon" aria-hidden>×</span><span>{formError}</span>
            </p>
          )}
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              className="bn-button bn-button-primary w-full sm:flex-1"
              onClick={handleSubmit}
              disabled={submitting}
            >
              {submitting ? 'Processing…' : `Confirm ${form}`}
            </button>
            <button
              className="bn-button bn-button-secondary w-full sm:w-auto"
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
        <p className="editorial-kicker mb-3">
          Transaction history
        </p>
        {transactions.length === 0 ? (
          <div className="bn-panel flex flex-col items-center gap-3 px-5 py-10 text-center">
            <span className="text-3xl text-[var(--border-strong)]">—</span>
            <p className="text-sm font-medium text-[var(--text-primary)]">No transactions yet</p>
            <p className="text-xs text-[var(--text-muted)]">Make your first deposit to get started.</p>
            <button className="btn-primary mt-1" onClick={() => openForm('deposit')}>
              + Deposit
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {transactions.map(tx => {
              const cfg = TX_CONFIG[tx.type] ?? { icon: '?', colorClass: 'text-[var(--text-muted)]', label: tx.type }
              const noteStr = tx.metadata && typeof tx.metadata === 'object' && 'note' in tx.metadata
                ? String((tx.metadata as Record<string, unknown>).note)
                : null
              return (
                <div key={tx.id} className="bn-panel flex items-center gap-3 p-4">
                  <span className={`text-base w-5 text-center shrink-0 ${cfg.colorClass}`}>
                    {cfg.icon}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-[var(--text-primary)]">{cfg.label}</p>
                    {noteStr && (
                      <p className="truncate text-xs text-[var(--text-muted)]">{noteStr}</p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`text-sm font-bold ${tx.amount >= 0 ? 'text-[var(--success)]' : 'text-[var(--negative)]'}`}>
                      {fmtDelta(tx.amount, symbol)}
                    </p>
                    <p className="text-xs text-[var(--text-muted)]">
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
