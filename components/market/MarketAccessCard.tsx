import Link from 'next/link'

import { BroadcastPanel, BroadcastStatus } from '@/components/ui/BroadcastNoir'
import type { MarketEligibilityPresentationModel } from '@/lib/market/presentation'

interface MarketAccessCardProps {
  model: MarketEligibilityPresentationModel
  surface: 'home' | 'settings'
}

export default function MarketAccessCard({ model, surface }: MarketAccessCardProps) {
  const isSettings = surface === 'settings'

  return (
    <section
      aria-labelledby={`market-access-${surface}-title`}
      className={isSettings ? 'scroll-mt-24' : undefined}
      data-market-access-reason={model.reason}
      data-market-access-status={model.status}
      data-market-access-surface={surface}
      id={isSettings ? 'market-access' : undefined}
    >
      <BroadcastPanel className="overflow-hidden">
        <div className="flex flex-col gap-4 border-b border-bn-border-strong p-5 sm:flex-row sm:items-start sm:justify-between sm:p-6">
          <div className="min-w-0">
            <p className="editorial-kicker">Рыночный доступ · серверный статус</p>
            <h2
              className="mt-2 font-display text-2xl font-black tracking-[-0.04em] text-bn-text sm:text-3xl"
              id={`market-access-${surface}-title`}
            >
              Рыночный доступ
            </h2>
          </div>
          <BroadcastStatus className="w-fit shrink-0" status={model.tone}>
            {model.heading}
          </BroadcastStatus>
        </div>

        <div className={`grid gap-5 p-5 sm:p-6 ${isSettings ? 'lg:grid-cols-[minmax(0,1fr)_16rem]' : 'md:grid-cols-[minmax(0,1fr)_auto] md:items-end'}`}>
          <div className="min-w-0">
            <p className="max-w-2xl text-sm leading-6 text-bn-muted">{model.description}</p>
            <p className="mt-4 border-l-2 border-bn-signal pl-4 text-xs leading-5 text-bn-muted">
              Язык, валюта и часовой пояс управляют только отображением. Они не подтверждают территорию и не открывают доступ.
            </p>
          </div>

          {isSettings ? (
            <dl className="grid gap-px overflow-hidden rounded-control border border-bn-border-subtle bg-bn-border-subtle text-xs">
              <MarketFact label="Профиль" value="Англия · Уэльс · Шотландия" />
              <MarketFact label="Решение" value="Доступ не предоставлен" />
              <MarketFact label="Источник" value="Серверная конфигурация" />
            </dl>
          ) : (
            <Link className="bn-button bn-button-secondary w-full justify-center sm:w-auto" href="/settings#market-access">
              Посмотреть текущий статус
            </Link>
          )}
        </div>

        {isSettings ? (
          <div className="border-t border-bn-border-strong px-5 py-4 sm:px-6">
            <p className="text-xs leading-5 text-bn-muted">
              Проверка данных и изменение статуса появятся только после отдельного серверного этапа. Сейчас этот экран ничего не собирает и не меняет.
            </p>
          </div>
        ) : null}
      </BroadcastPanel>
    </section>
  )
}

function MarketFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-bn-field p-3.5">
      <dt className="font-mono text-[11px] font-bold uppercase tracking-[0.1em] text-bn-quiet">{label}</dt>
      <dd className="mt-1.5 font-semibold leading-5 text-bn-text">{value}</dd>
    </div>
  )
}
