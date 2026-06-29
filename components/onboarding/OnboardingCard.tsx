'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { trackClientEvent } from '@/lib/analytics/client'
import { EVENTS } from '@/lib/analytics/events'

export default function OnboardingCard() {
  const [dismissed, setDismissed] = useState(false)
  const [closing,   setClosing]   = useState(false)

  useEffect(() => {
    trackClientEvent(EVENTS.ONBOARDING_VIEWED, {})
  }, [])

  async function dismiss() {
    if (closing) return
    setClosing(true)
    try {
      await fetch('/api/onboarding/complete', { method: 'PATCH' })
      trackClientEvent(EVENTS.ONBOARDING_COMPLETED, {})
    } finally {
      setDismissed(true)
      setClosing(false)
    }
  }

  if (dismissed) return null

  return (
    <div className="card border border-amber-800/40 bg-amber-950/10 flex items-start gap-4">
      <span className="text-2xl shrink-0">👋</span>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-amber-500/80 uppercase tracking-wider mb-1">
          Welcome to BetTracker AI
        </p>
        <p className="text-sm text-slate-300 leading-relaxed">
          Analyze matches with AI, track every bet, and get coaching feedback&nbsp;— all in one place.
          Start by running an analysis or adding your first bet.
        </p>
        <div className="flex gap-2 mt-3">
          <Link href="/ai" className="btn-primary text-xs px-3 py-1.5" onClick={dismiss}>
            Analyze a match
          </Link>
          <button className="btn-ghost text-xs px-3 py-1.5" onClick={dismiss} disabled={closing}>
            Got it
          </button>
        </div>
      </div>
      <button
        className="text-slate-500 hover:text-slate-300 text-xs shrink-0 transition-colors"
        onClick={dismiss}
        disabled={closing}
        aria-label="Dismiss"
      >
        &#x2715;
      </button>
    </div>
  )
}
