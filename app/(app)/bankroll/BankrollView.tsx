'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import type { Bankroll, BankrollTransaction, TxnType } from '@/types'
import { BroadcastButton, BroadcastDataValue, BroadcastPanel, BroadcastStatus } from '@/components/ui/BroadcastNoir'

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$', EUR: '€', UAH: '₴', GBP: '£', CAD: 'CA$', AUD: 'A$',
}

const TX_CONFIG: Record<TxnType, { icon: string; label: string }> = {
  deposit:    { icon: '↑', label: 'Deposit' },
  withdrawal: { icon: '↓', label: 'Withdrawal' },
  stake:      { icon: '●', label: 'Stake' },
  payout:     { icon: '✓', label: 'Payout' },
  adjustment: { icon: '±', label: 'Adjustment' },
  bonus:      { icon: '★', label: 'Bonus' },
}

function fmtBalance(amount: number, symbol: string): string {
  return `${symbol}${Math.abs(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtDelta(amount: number, symbol: string): string {
  const sign = amount >= 0 ? '+' : '−'
  return `${sign}${symbol}${Math.abs(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
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
    <div className="flex flex-col gap-6">
      {/* Balance */}
      <BroadcastPanel className="p-6 text-center sm:p-8">
        <p className="mb-2 font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-bn-quiet">Current Balance</p>
        <BroadcastDataValue className="block font-display text-4xl font-black">
          {symbol}{balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </BroadcastDataValue>
        <p className="mt-2 text-[11px] text-bn-muted">Deposits + payouts − stakes − withdrawals</p>
      </BroadcastPanel>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="stat-card">
          <p className="stat-label">Deposited</p>
          <BroadcastDataValue className="stat-value">{fmtBalance(stats.totalDeposited, symbol)}</BroadcastDataValue>
          <p className="mt-0.5 text-[10px] text-bn-quiet">total added</p>
        </div>
        <div className="stat-card">
          <p className="stat-label">Withdrawn</p>
          <BroadcastDataValue className="stat-value">{fmtBalance(stats.totalWithdrawn, symbol)}</BroadcastDataValue>
          <p className="mt-0.5 text-[10px] text-bn-quiet">total removed</p>
        </div>
        <div className="stat-card">
          <p className="stat-label">Net from bets</p>
          <BroadcastDataValue className="stat-value">
            {stats.netFromBets >= 0 ? '+' : '−'}{symbol}{Math.abs(stats.netFromBets).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </BroadcastDataValue>
          <p className="mt-0.5 text-[10px] text-bn-quiet">payouts minus stakes</p>
        </div>
      </div>
      <p className="-mt-2 text-center text-[10px] text-bn-muted">Pending bet stakes are not automatically deducted from your balance.</p>

      {/* Action buttons */}
      <div className="flex gap-3">
        <BroadcastButton
          className="flex-1"
          tone={form === 'deposit' ? 'primary' : 'secondary'}
          onClick={() => form === 'deposit' ? closeForm() : openForm('deposit')}
        >
          + Deposit
        </BroadcastButton>
        <BroadcastButton
          className="flex-1"
          tone={form === 'withdrawal' ? 'destructive' : 'secondary'}
          onClick={() => form === 'withdrawal' ? closeForm() : openForm('withdrawal')}
        >
          − Withdraw
        </BroadcastButton>
      </div>

      {/* Inline form */}
      {form && (
        <BroadcastPanel className="flex flex-col gap-3 p-4">
          <p className="text-sm font-medium capitalize text-bn-text">{form}</p>
          <div>
            <label className="label">Amount</label>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-sm text-bn-muted">{symbol}</span>
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
              Note <span className="font-normal text-bn-quiet">(optional)</span>
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
            <BroadcastStatus className="w-full" status="negative">{formError}</BroadcastStatus>
          )}
          <div className="flex gap-2">
            <BroadcastButton
              className="flex-1"
              onClick={handleSubmit}
              disabled={submitting}
            >
              {submitting ? 'Processing…' : `Confirm ${form}`}
            </BroadcastButton>
            <BroadcastButton
              className="flex-1"
              tone="secondary"
              onClick={closeForm}
              disabled={submitting}
            >
              Cancel
            </BroadcastButton>
          </div>
        </BroadcastPanel>
      )}

      {/* Transaction history */}
      <div>
        <p className="mb-3 font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-bn-quiet">
          Transaction history
        </p>
        {transactions.length === 0 ? (
          <BroadcastPanel className="flex flex-col items-center gap-3 py-10 text-center">
            <BroadcastStatus status="neutral">Empty</BroadcastStatus>
            <p className="text-sm font-medium text-bn-text">No transactions yet</p>
            <p className="text-xs text-bn-muted">Make your first deposit to get started.</p>
            <BroadcastButton className="mt-1" onClick={() => openForm('deposit')}>
              + Deposit
            </BroadcastButton>
          </BroadcastPanel>
        ) : (
          <div className="flex flex-col gap-2">
            {transactions.map(tx => {
              const cfg = TX_CONFIG[tx.type] ?? { icon: '?', label: tx.type }
              const noteStr = tx.metadata && typeof tx.metadata === 'object' && 'note' in tx.metadata
                ? String((tx.metadata as Record<string, unknown>).note)
                : null
              return (
                <BroadcastPanel key={tx.id} className="flex items-center gap-3 p-4">
                  <span aria-hidden className="w-5 shrink-0 text-center text-base text-bn-muted">
                    {cfg.icon}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-bn-text">{cfg.label}</p>
                    {noteStr && (
                      <p className="truncate text-[11px] text-bn-muted">{noteStr}</p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <BroadcastDataValue className="block text-sm font-medium">
                      {fmtDelta(tx.amount, symbol)}
                    </BroadcastDataValue>
                    <p className="text-[11px] text-bn-muted">
                      {fmtBalance(tx.balance_after, symbol)} · {fmtDate(tx.created_at)}
                    </p>
                  </div>
                </BroadcastPanel>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
