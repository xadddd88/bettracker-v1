import { createClient } from '@/lib/supabase/server'
import CoachView from './CoachView'
import BetaNote from '@/components/ui/BetaNote'
import { PageView } from '@/lib/analytics/PageView'
import { EVENTS } from '@/lib/analytics/events'
import type { CoachingSession } from '@/types'
import { BroadcastPanel } from '@/components/ui/BroadcastNoir'
import SectionGuide from '@/components/ui/SectionGuide'

export default async function CoachPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [sessionsRes, settledRes] = await Promise.all([
    supabase
      .from('coaching_sessions')
      .select('*')
      .eq('user_id', user!.id)
      .order('created_at', { ascending: false })
      .limit(10),
    supabase
      .from('bets')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user!.id)
      .is('archived_at', null)
      .in('status', ['won', 'lost', 'void']),
  ])

  const sessions = (sessionsRes.data ?? []) as CoachingSession[]
  const settledBetsCount = settledRes.count ?? 0

  return (
    <main className="bn-page mx-auto flex w-full max-w-3xl flex-col gap-4 pb-8">
      <PageView event={EVENTS.COACH_PAGE_VIEWED} />
      <BroadcastPanel className="p-5 sm:p-7">
        <p className="editorial-kicker">Аналитика · разбор</p>
        <h1 className="mt-3 font-display text-[clamp(2.75rem,8vw,6rem)] font-black leading-none tracking-[-0.06em] text-bn-text">Разбор</h1>
        <p className="mt-4 text-sm leading-6 text-bn-muted">
          Ретроспективный разбор закрытых ставок: паттерны, слабые места и конкретные действия для дисциплины.
        </p>
      </BroadcastPanel>
      <SectionGuide
        title="Как работает разбор"
        items={[
          {
            title: 'Выберите период',
            body: 'Разбор анализирует только закрытые ставки за выбранное окно: 7, 30, 90 дней или всю историю.',
          },
          {
            title: 'Добавьте фокус',
            body: 'Можно указать, что именно проверить: экспрессы, теннис, завышенный риск, поздние ставки или качество пропусков.',
          },
          {
            title: 'Примените рекомендации',
            body: 'Результат показывает сильные стороны, зоны улучшения и практические действия, которые стоит проверить в следующих решениях.',
          },
        ]}
        note={{
          title: 'Что разбор не делает',
          body: 'Разбор не прогнозирует будущие матчи. Он разбирает вашу историю и помогает улучшить процесс принятия решений.',
        }}
      />
      {settledBetsCount < 5 && (
        <BetaNote>
          Разбор работает лучше, когда есть хотя бы 5 закрытых ставок. Сейчас: {settledBetsCount}; качество вывода растёт вместе с историей.
        </BetaNote>
      )}
      <CoachView initialSessions={sessions} settledBetsCount={settledBetsCount} />
    </main>
  )
}
