import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import BankrollView from './BankrollView'
import { PageView } from '@/lib/analytics/PageView'
import { EVENTS } from '@/lib/analytics/events'
import type { Bankroll, BankrollTransaction } from '@/types'
import { BroadcastPanel, BroadcastStatus } from '@/components/ui/BroadcastNoir'

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
    <main className="bn-page mx-auto flex w-full max-w-5xl flex-col gap-4 pb-8">
      <PageView event={EVENTS.BANKROLL_PAGE_VIEWED} />
      <BroadcastPanel className="p-5 sm:p-7">
        <p className="editorial-kicker">Ledger · recorded transactions</p>
        <h1 className="mt-3 font-display text-[clamp(2.75rem,8vw,6rem)] font-black leading-none tracking-[-0.06em] text-bn-text">Bankroll</h1>
        <p className="mt-4 max-w-2xl text-sm leading-6 text-bn-muted">Your dedicated betting fund — deposits, stake usage, and net results from settled bets.</p>
      </BroadcastPanel>
      {bankroll ? (
        <BankrollView
          bankroll={bankroll}
          transactions={transactions}
          currency={currency}
          stats={{ totalDeposited, totalWithdrawn, netFromBets }}
        />
      ) : (
        <BroadcastPanel className="grid min-h-64 place-items-center p-6 text-center">
          <div><BroadcastStatus status="negative">Bankroll not set up</BroadcastStatus><p className="mt-4 text-xs text-bn-muted">Your default bankroll could not be loaded. Try refreshing — if this persists, contact support.</p></div>
        </BroadcastPanel>
      )}
    </main>
  )
}
