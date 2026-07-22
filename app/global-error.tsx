'use client'

import * as Sentry from '@sentry/nextjs'
import { RefreshCcw } from 'lucide-react'
import { useEffect } from 'react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-[var(--night)] text-[var(--text-primary)]">
        <main className="mx-auto flex min-h-screen w-full max-w-3xl items-center px-5 py-12 sm:px-8">
          <section
            aria-labelledby="global-error-title"
            className="w-full border-l-4 border-[var(--negative)] bg-[var(--field)] px-5 py-8 sm:px-8 sm:py-10"
          >
            <p className="font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--negative)]">
              System interruption
            </p>
            <h1 id="global-error-title" className="mt-3 font-display text-3xl font-black sm:text-4xl">
              This screen could not load
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-[var(--text-muted)]">
              We could not display the latest state. Retry the screen when you are ready.
            </p>
            <button
              type="button"
              onClick={reset}
              className="bn-button bn-button-primary mt-6 w-full sm:w-auto"
            >
              <RefreshCcw aria-hidden="true" className="h-4 w-4" />
              Retry
            </button>
          </section>
        </main>
      </body>
    </html>
  )
}
