import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import BankrollView from './BankrollView'
import { PageView } from '@/lib/analytics/PageView'
import { EVENTS } from '@/lib/analytics/events'
import type { Bankroll, BankrollTransaction } from '@/types'
import { BroadcastPanel, BroadcastStatus } from '@/components/ui/BroadcastNoir'
import SectionGuide from '@/components/ui/SectionGuide'

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
        <p className="editorial-kicker">Риск · контроль банкролла</p>
        <h1 className="mt-3 font-display text-[clamp(2.75rem,8vw,6rem)] font-black leading-none tracking-[-0.06em] text-bn-text">Риск</h1>
        <p className="mt-4 max-w-2xl text-sm leading-6 text-bn-muted">Контроль фонда, операций и текущего риска: пополнения, выводы, использование ставки и результат закрытых исходов.</p>
      </BroadcastPanel>
      <SectionGuide
        title="Как вести риск"
        items={[
          {
            title: 'Запишите стартовый баланс',
            body: 'Пополнение фиксирует деньги, которые вы выделили под ставки. Это база для контроля риска и результата.',
          },
          {
            title: 'Отделяйте выводы от ставок',
            body: 'Вывод уменьшает баланс как отдельная операция. Ставки и выплаты появляются через рассчитанные записи Tracker.',
          },
          {
            title: 'Сверяйте историю операций',
            body: 'История показывает сумму операции, баланс после неё и дату. Это помогает найти ручную ошибку до анализа статистики.',
          },
        ]}
        note={{
          title: 'Граница автоматизации',
          body: 'Открытые ставки пока не списываются автоматически из баланса. Баланс меняется через операции и закрытые финансовые записи.',
        }}
      />
      {bankroll ? (
        <BankrollView
          bankroll={bankroll}
          transactions={transactions}
          currency={currency}
          stats={{ totalDeposited, totalWithdrawn, netFromBets }}
        />
      ) : (
        <BroadcastPanel className="grid min-h-64 place-items-center p-6 text-center">
          <div><BroadcastStatus status="negative">Банкролл не настроен</BroadcastStatus><p className="mt-4 text-xs text-bn-muted">Не удалось загрузить основной банкролл. Обновите страницу. Если проблема повторится, напишите поддержке.</p></div>
        </BroadcastPanel>
      )}
    </main>
  )
}
