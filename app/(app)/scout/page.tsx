import { createClient } from '@/lib/supabase/server'
import ScoutForm from './ScoutForm'
import { PageView } from '@/lib/analytics/PageView'
import { EVENTS } from '@/lib/analytics/events'
import type { MarketOpportunity } from '@/types'
import { getActiveScoutPresets } from '@/lib/events/pulse'
import { BroadcastPanel } from '@/components/ui/BroadcastNoir'
import SectionGuide from '@/components/ui/SectionGuide'

export default async function ScoutPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data } = await supabase
    .from('market_opportunities')
    .select('*')
    .eq('user_id', user!.id)
    .not('status', 'in', '("dismissed","expired")')
    .order('created_at', { ascending: false })
    .limit(20)

  const opportunities  = (data ?? []) as MarketOpportunity[]
  const today          = new Date().toISOString().slice(0, 10)
  const pulsePresets   = getActiveScoutPresets(today)

  return (
    <main className="bn-page mx-auto flex w-full max-w-3xl flex-col gap-4 pb-8">
      <PageView event={EVENTS.SCOUT_PAGE_VIEWED} />
      <BroadcastPanel className="p-5 sm:p-7">
        <p className="editorial-kicker">Исследование · поиск кандидатов</p>
        <h1 className="mt-3 font-display text-[clamp(2.75rem,8vw,6rem)] font-black leading-none tracking-[-0.06em] text-bn-text">Скаут</h1>
        <p className="mt-4 text-sm leading-6 text-bn-muted">
          Поиск потенциально интересных рынков: сначала кандидат, затем отдельная проверка в AI Analyst.
        </p>
      </BroadcastPanel>
      <SectionGuide
        title="Как пользоваться Скаутом"
        items={[
          {
            title: 'Опишите область поиска',
            body: 'Укажите спорт, турнир, команды, период и тип идеи: андердог, тотал, фора, форма команды или другое направление.',
          },
          {
            title: 'Получите кандидатов',
            body: 'Скаут возвращает рынки для дальнейшего изучения. Score показывает релевантность исследования, а не вероятность прохода.',
          },
          {
            title: 'Передайте в Analyst',
            body: 'Кандидата можно отправить в AI Analyst, добавить в наблюдение или скрыть. Решение принимается только после отдельного анализа.',
          },
        ]}
        note={{
          title: 'Граница доверия',
          body: 'Скаут не показывает ценовой edge и не является готовой ставкой. Текущие коэффициенты, новости и составы нужно подтверждать отдельно.',
        }}
      />
      <ScoutForm initialOpportunities={opportunities} pulsePresets={pulsePresets} />
    </main>
  )
}
