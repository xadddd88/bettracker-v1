'use client'

import Link from 'next/link'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function AccessDeniedPage() {
  const [signingOut, setSigningOut] = useState(false)

  async function signOut() {
    setSigningOut(true)
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.assign('/login')
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-[var(--night)] px-4 text-[var(--text-primary)]">
      <section className="w-full max-w-xl border border-[var(--border-subtle)] bg-[var(--surface)] p-8">
        <p className="editorial-kicker mb-3">BetTracker Private</p>
        <h1 className="font-display text-3xl font-semibold">Доступ закрыт</h1>
        <p className="mt-4 text-sm leading-6 text-[var(--text-secondary)]">
          У этой учётной записи нет действующего приглашения. Данные рабочего пространства не были открыты.
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={signOut}
            disabled={signingOut}
            className="border border-[var(--border-strong)] px-4 py-2 text-sm disabled:opacity-60"
          >
            {signingOut ? 'Выходим…' : 'Выйти из аккаунта'}
          </button>
          <Link href="/login" className="px-4 py-2 text-sm text-[var(--text-secondary)]">
            Вернуться ко входу
          </Link>
        </div>
      </section>
    </main>
  )
}
