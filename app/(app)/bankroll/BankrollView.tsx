'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import type { Bankroll, BankrollTransaction, TxnType } from '@/types'
import { BroadcastButton, BroadcastDataValue, BroadcastPanel, BroadcastStatus } from '@/components/ui/BroadcastNoir'
import { currencySymbol, formatMoney } from '@/lib/money'

const TX_CONFIG: Record<TxnType, { icon: string; label: string }> = {
  deposit:    { icon: '↑', label: 'Пополнение' },
  withdrawal: { icon: '↓', label: 'Вывод' },
  stake:      { icon: '●', label: 'Ставка' },
  payout:     { icon: '✓', label: 'Выплата' },
  adjustment: { icon: '±', label: 'Корректировка' },
  bonus:      { icon: '★', label: 'Бонус' },
}

function fmtDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('ru-RU', { month: 'short', day: 'numeric', timeZone: 'UTC' })
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
  const symbol = currencySymbol(currency)

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
      setFormError('Введите положительную сумму')
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
        setFormError(json.error ?? 'Операция не выполнена')
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
      setFormError('Ошибка сети — попробуйте ещё раз')
    } finally {
      setSubmitting(false)
    }
  }, [amount, note, form, bankroll, idemKey, closeForm, router])

  return (
    <div className="flex flex-col gap-6">
      {/* Balance */}
      <BroadcastPanel className="p-6 text-center sm:p-8">
        <p className="mb-2 font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-bn-quiet">Текущий баланс</p>
        <BroadcastDataValue className="block font-display text-4xl font-black">
          {formatMoney(balance, currency)}
        </BroadcastDataValue>
        <p className="mt-2 text-[11px] text-bn-muted">Пополнения + выплаты - ставки - выводы</p>
      </BroadcastPanel>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="stat-card">
          <p className="stat-label">Пополнено</p>
          <BroadcastDataValue className="stat-value">{formatMoney(stats.totalDeposited, currency)}</BroadcastDataValue>
          <p className="mt-0.5 text-[10px] text-bn-quiet">всего добавлено</p>
        </div>
        <div className="stat-card">
          <p className="stat-label">Выведено</p>
          <BroadcastDataValue className="stat-value">{formatMoney(stats.totalWithdrawn, currency)}</BroadcastDataValue>
          <p className="mt-0.5 text-[10px] text-bn-quiet">всего снято</p>
        </div>
        <div className="stat-card">
          <p className="stat-label">Нетто по ставкам</p>
          <BroadcastDataValue className="stat-value">
            {formatMoney(stats.netFromBets, currency, true)}
          </BroadcastDataValue>
          <p className="mt-0.5 text-[10px] text-bn-quiet">выплаты минус ставки</p>
        </div>
      </div>
      <p className="-mt-2 text-center text-[10px] text-bn-muted">Открытые ставки пока не списываются автоматически из баланса.</p>

      {/* Action buttons */}
      <div className="flex gap-3">
        <BroadcastButton
          className="flex-1"
          tone={form === 'deposit' ? 'primary' : 'secondary'}
          onClick={() => form === 'deposit' ? closeForm() : openForm('deposit')}
        >
          + Пополнить
        </BroadcastButton>
        <BroadcastButton
          className="flex-1"
          tone={form === 'withdrawal' ? 'destructive' : 'secondary'}
          onClick={() => form === 'withdrawal' ? closeForm() : openForm('withdrawal')}
        >
          - Вывести
        </BroadcastButton>
      </div>

      {/* Inline form */}
      {form && (
        <BroadcastPanel className="flex flex-col gap-3 p-4">
          <p className="text-sm font-medium text-bn-text">{form === 'deposit' ? 'Пополнение' : 'Вывод'}</p>
          <div>
            <label className="label">Сумма</label>
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
              Комментарий <span className="font-normal text-bn-quiet">(необязательно)</span>
            </label>
            <input
              className="input mt-1"
              type="text"
              maxLength={200}
              placeholder="Например: стартовое пополнение"
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
              {submitting ? 'Обрабатываем...' : form === 'deposit' ? 'Подтвердить пополнение' : 'Подтвердить вывод'}
            </BroadcastButton>
            <BroadcastButton
              className="flex-1"
              tone="secondary"
              onClick={closeForm}
              disabled={submitting}
            >
              Отмена
            </BroadcastButton>
          </div>
        </BroadcastPanel>
      )}

      {/* Transaction history */}
      <div>
        <p className="mb-3 font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-bn-quiet">
          История операций
        </p>
        {transactions.length === 0 ? (
          <BroadcastPanel className="flex flex-col items-center gap-3 py-10 text-center">
            <BroadcastStatus status="neutral">Пусто</BroadcastStatus>
            <p className="text-sm font-medium text-bn-text">Операций пока нет</p>
            <p className="text-xs text-bn-muted">Сделайте первое пополнение, чтобы начать вести банкролл.</p>
            <BroadcastButton className="mt-1" onClick={() => openForm('deposit')}>
              + Пополнить
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
                      {formatMoney(tx.amount, currency, true)}
                    </BroadcastDataValue>
                    <p className="text-[11px] text-bn-muted">
                      {formatMoney(tx.balance_after, currency)} · {fmtDate(tx.created_at)}
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
