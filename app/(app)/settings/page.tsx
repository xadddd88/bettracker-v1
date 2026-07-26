import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import SettingsForm from './SettingsForm'
import { PageView } from '@/lib/analytics/PageView'
import { EVENTS } from '@/lib/analytics/events'
import type { Profile } from '@/types'
import { BroadcastPanel, BroadcastStatus } from '@/components/ui/BroadcastNoir'
import SectionGuide from '@/components/ui/SectionGuide'

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  return (
    <main className="bn-page mx-auto flex w-full max-w-3xl flex-col gap-4 pb-8">
      <PageView event={EVENTS.SETTINGS_PAGE_VIEWED} />
      <BroadcastPanel className="p-5 sm:p-7">
        <p className="editorial-kicker">Аккаунт · настройки</p>
        <h1 className="mt-3 font-display text-[clamp(2.75rem,8vw,6rem)] font-black leading-none tracking-[-0.06em] text-bn-text">Настройки</h1>
        <p className="mt-4 text-sm leading-6 text-bn-muted">Профиль, валюта, банкролл и параметры анализа.</p>
      </BroadcastPanel>
      <SectionGuide
        title="Что управляется в настройках"
        items={[
          {
            title: 'Профиль и валюта',
            body: 'Имя используется в интерфейсе, а валюта определяет отображение ставок, банкролла и финансовых метрик.',
          },
          {
            title: 'Базовая ставка и Kelly',
            body: 'Базовая ставка помогает быстрее заполнять записи, а доля Kelly задаёт осторожность расчётов риска.',
          },
          {
            title: 'Язык источников и часовой пояс',
            body: 'Веб-поиск и часовой пояс влияют на проверку актуальности, времени матчей и качество анализа.',
          },
        ]}
        note={{
          title: 'Важное ограничение',
          body: 'Смена валюты не конвертирует уже существующий баланс. Перед изменением валюты лучше сверить банкролл вручную.',
        }}
      />
      {profile ? (
        <SettingsForm profile={profile as Profile} email={user.email ?? ''} />
      ) : (
        <BroadcastPanel className="grid min-h-64 place-items-center p-6 text-center">
          <div><BroadcastStatus status="negative">Профиль не загрузился</BroadcastStatus><p className="mt-4 text-xs text-bn-muted">Обновите страницу. Если проблема повторится, напишите поддержке.</p></div>
        </BroadcastPanel>
      )}
    </main>
  )
}
