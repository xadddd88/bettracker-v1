import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import BankrollView from './BankrollView'
import { PageView } from '@/lib/analytics/PageView'
import { EVENTS } from '@/lib/analytics/events'
import type { Bankroll, BankrollTransaction } from '@/types'

export default async function BankrollPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [bankrollRes, txRes, profileRes] = await Promise.all([
    supabase.from('bankrolls').select('*').eq('user_id', user.id).eq('is_default', true).single(),
    supabase
      .from('bankroll_transactions')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50),
    supabase.from('profiles').select('currency').eq('id', user.id).single(),
  ])

  const bankroll     = bankrollRes.data as Bankroll | null
  const transactions = (txRes.data ?? []) as BankrollTransaction[]
  const currency     = profileRes.data?.currency ?? bankroll?.currency ?? 'USD'

  let totalDeposited = 0
  let totalWithdrawn = 0
  let netFromBets    = 0
  for (const tx of transactions) {
    if (tx.type === 'deposit')                         totalDeposited += tx.amount
    if (tx.type === 'withdrawal')                      totalWithdrawn += Math.abs(tx.amount)
    if (tx.type === 'stake' || tx.type === 'payout')   netFromBets   += tx.amount
  }

  return (
    <div className="bn-page flex flex-col gap-6">
      <PageView event={EVENTS.BANKROLL_PAGE_VIEWED} />
      <div>
        <p className="editorial-kicker">Capital desk</p>
        <h1 className="mt-2 font-display text-3xl font-black text-[var(--text-primary)]">Bankroll</h1>
        <p className="mt-2 max-w-2xl text-sm text-[var(--text-muted)]">Your dedicated betting fund — track deposits, stake usage, and net results from settled bets.</p>
      </div>
      {bankroll ? (
        <BankrollView
          bankroll={bankroll}
          transactions={transactions}
          currency={currency}
          stats={{ totalDeposited, totalWithdrawn, netFromBets }}
        />
      ) : (
        <div className="bn-panel border-[var(--negative)] px-5 py-12 text-center">
          <p className="text-sm font-bold text-[var(--negative)]">× Bankroll not set up</p>
          <p className="mt-2 text-xs text-[var(--text-muted)]">Your default bankroll could not be loaded. Try refreshing — if this persists, contact support.</p>
        </div>
      )}
    </div>
  )
}
