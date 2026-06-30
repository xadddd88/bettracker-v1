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
    <div className="flex flex-col gap-6">
      <PageView event={EVENTS.BANKROLL_PAGE_VIEWED} />
      <div>
        <h1 className="text-2xl font-bold text-white">Bankroll</h1>
        <p className="text-sm text-gray-500 mt-1">Your dedicated betting fund — track deposits, stake usage, and net results from settled bets.</p>
      </div>
      {bankroll ? (
        <BankrollView
          bankroll={bankroll}
          transactions={transactions}
          currency={currency}
          stats={{ totalDeposited, totalWithdrawn, netFromBets }}
        />
      ) : (
        <div className="card text-center py-12">
          <p className="text-red-400 text-sm font-medium mb-1">Bankroll not set up</p>
          <p className="text-gray-500 text-xs">Your default bankroll could not be loaded. Try refreshing — if this persists, contact support.</p>
        </div>
      )}
    </div>
  )
}
