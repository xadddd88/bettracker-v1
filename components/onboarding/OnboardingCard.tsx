'use client'

import { useState, useEffect } from 'react'
import { trackClientEvent } from '@/lib/analytics/client'
import { EVENTS } from '@/lib/analytics/events'
import { BroadcastButton, BroadcastPanel } from '@/components/ui/BroadcastNoir'

const STEPS = [
  {
    icon:  '🤖',
    title: 'AI-powered analysis',
    body:  'The AI Analyst checks source coverage and risk. Pricing is shown only when the required model inputs are verified.',
  },
  {
    icon:  '🔍',
    title: 'Scout for value bets',
    body:  "Scout searches for opportunities across sports and leagues. Save promising finds to your watchlist and convert them to decisions when you're ready.",
  },
  {
    icon:  '🎯',
    title: 'Track every bet',
    body:  "Log bets manually, scan coupons from screenshots, or place directly from the AI's recommendation. Risk Manager checks your bankroll before each bet.",
  },
  {
    icon:  '📈',
    title: 'Improve with data',
    body:  'Stats shows exact win rate, ROI, and outcomes from saved records. Coach uses settled history for retrospective advice.',
  },
]

export default function OnboardingCard() {
  const [step,      setStep]      = useState(0)
  const [dismissed, setDismissed] = useState(false)
  const [closing,   setClosing]   = useState(false)

  useEffect(() => {
    trackClientEvent(EVENTS.ONBOARDING_VIEWED, { step })
  }, [step])

  async function markComplete(stepsViewed: number) {
    if (closing) return
    setClosing(true)
    try {
      await fetch('/api/onboarding/complete', { method: 'PATCH' })
      trackClientEvent(EVENTS.ONBOARDING_COMPLETED, { steps_viewed: stepsViewed })
    } finally {
      setDismissed(true)
      setClosing(false)
    }
  }

  function handleNext() {
    const next = step + 1
    if (next >= STEPS.length) {
      markComplete(STEPS.length)
    } else {
      setStep(next)
    }
  }

  if (dismissed) return null

  const current = STEPS[step]
  const isLast  = step === STEPS.length - 1

  return (
    <BroadcastPanel className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-2xl shrink-0">{current.icon}</span>
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wider text-bn-review">
              Welcome to BetTracker AI &middot; {step + 1} of {STEPS.length}
            </p>
            <h2 className="mt-0.5 text-base font-semibold text-bn-text">{current.title}</h2>
          </div>
        </div>
        <button
          className="min-h-11 min-w-11 shrink-0 rounded-control text-xs text-bn-muted transition-colors hover:bg-bn-raised"
          onClick={() => markComplete(step + 1)}
          disabled={closing}
          aria-label="Dismiss onboarding"
        >
          ✕
        </button>
      </div>

      <p className="mt-3 text-sm leading-relaxed text-bn-muted">{current.body}</p>

      <div className="flex items-center gap-4 mt-4">
        {/* Step dots */}
        <div className="flex items-center gap-1.5 flex-1">
          {STEPS.map((_, i) => (
            <div
              aria-hidden
              key={i}
              className={`h-1 rounded-control transition-all duration-200 ${
                i === step
                  ? 'w-5 bg-bn-signal'
                  : i < step
                  ? 'w-2 bg-bn-border-strong'
                  : 'w-2 bg-bn-border-subtle'
              }`}
            />
          ))}
        </div>

        <div className="flex gap-2 shrink-0">
          {step > 0 && (
            <BroadcastButton
              tone="secondary"
              onClick={() => setStep(s => s - 1)}
            >
              &larr; Back
            </BroadcastButton>
          )}
          <BroadcastButton
            onClick={handleNext}
            disabled={closing}
          >
            {isLast ? '✓ Got it' : 'Next →'}
          </BroadcastButton>
        </div>
      </div>
    </BroadcastPanel>
  )
}
