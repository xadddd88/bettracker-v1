import Link from 'next/link'

export default function ServiceUnavailablePage() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-[var(--night)] px-4 text-[var(--text-primary)]">
      <section className="w-full max-w-xl border border-[var(--border-subtle)] bg-[var(--surface)] p-8">
        <p className="editorial-kicker mb-3">BetTracker Private</p>
        <h1 className="font-display text-3xl font-semibold">Проверка доступа временно недоступна</h1>
        <p className="mt-4 text-sm leading-6 text-[var(--text-secondary)]">
          Система закрыла доступ безопасным образом. Попробуйте ещё раз позже — данные и настройки не изменены.
        </p>
        <Link href="/dashboard" className="mt-7 inline-block border border-[var(--border-strong)] px-4 py-2 text-sm">
          Повторить проверку
        </Link>
      </section>
    </main>
  )
}
