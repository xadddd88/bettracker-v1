import SettingsForm from '@/app/(app)/settings/SettingsForm'
import MarketAccessCard from '@/components/market/MarketAccessCard'
import SectionGuide from '@/components/ui/SectionGuide'
import { BroadcastPanel } from '@/components/ui/BroadcastNoir'
import { resolveCurrentMarketAccessPresentation } from '@/lib/market/runtime-presentation'
import { notFound } from 'next/navigation'
import type { Profile } from '@/types'

const PREVIEW_PROFILE: Profile = {
  id: '00000000-0000-4000-8000-000000000001',
  display_name: 'Acceptance User',
  currency: 'GBP',
  default_stake: 10,
  kelly_fraction: 0.5,
  web_search_enabled: false,
  timezone: 'Europe/Kyiv',
  onboarding_completed: true,
  created_at: '2026-08-13T00:00:00.000Z',
  updated_at: '2026-08-13T00:00:00.000Z',
}

interface MarketAccessDesignPreviewProps {
  searchParams: Promise<{ variant?: string }>
}

export default async function MarketAccessDesignPreview({ searchParams }: MarketAccessDesignPreviewProps) {
  if (process.env.VERCEL_ENV === 'production') notFound()
  const { variant } = await searchParams
  const showImplementation = variant === 'implementation'
  const marketAccess = resolveCurrentMarketAccessPresentation('ru')

  return (
    <div className="web-editorial min-h-dvh bg-[var(--night)] p-4 text-[var(--text-primary)] md:p-8">
      <main className="bn-page mx-auto flex w-full max-w-3xl flex-col gap-4 pb-8">
        <BroadcastPanel className="p-5 sm:p-7">
          <p className="editorial-kicker">Аккаунт · настройки</p>
          <h1 className="mt-3 font-display text-[clamp(2.75rem,8vw,6rem)] font-black leading-none tracking-[-0.06em] text-bn-text">
            Настройки
          </h1>
          <p className="mt-4 text-sm leading-6 text-bn-muted">
            {showImplementation
              ? 'Профиль, доступ к рынку, банкролл и параметры анализа.'
              : 'Профиль, валюта, банкролл и параметры анализа.'}
          </p>
        </BroadcastPanel>
        {showImplementation ? <MarketAccessCard model={marketAccess} surface="settings" /> : null}
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
              title: showImplementation ? 'Доступ и часовой пояс' : 'Язык источников и часовой пояс',
              body: showImplementation
                ? 'Статус рынка приходит с сервера. Веб-поиск и часовой пояс влияют только на актуальность времени и качество анализа.'
                : 'Веб-поиск и часовой пояс влияют на проверку актуальности, времени матчей и качество анализа.',
            },
          ]}
          note={{
            title: 'Важное ограничение',
            body: 'Смена валюты не конвертирует уже существующий баланс. Перед изменением валюты лучше сверить банкролл вручную.',
          }}
        />
        <SettingsForm profile={PREVIEW_PROFILE} email="acceptance@example.test" />
      </main>
    </div>
  )
}
