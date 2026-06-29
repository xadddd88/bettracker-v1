'use client'

import { useState, useEffect } from 'react'
import { trackClientEvent } from '@/lib/analytics/client'
import { EVENTS } from '@/lib/analytics/events'

const STEPS = [
  {
    icon:  '🤖',
    title: 'AI-powered analysis',
    body:  'The AI Analyst evaluates edge, confidence, and risk for any market. Paste a match description and get a structured recommendation in seconds.',
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
    body:  'Analytics shows your win rate, ROI, and trends over time. The Coach Agent reads your history and gives personalised advice to sharpen your edge.',
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
    <div className="card border border-amber-800/40 bg-amber-950/10">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-2xl shrink-0">{current.icon}</span>
          <div className="min-w-0">
            <p className="text-xs font-medium text-amber-500/80 uppercase tracking-wider">
              Welcome to BetTracker AI &middot; {step + 1} of {STEPS.length}
            </p>
            <h2 className="text-base font-semibold text-white mt-0.5">{current.title}</h2>
          </div>
        </div>
        <button
          className="text-slate-500 hover:text-slate-300 transition-colors text-xs shrink-0 pt-0.5"
          onClick={() => markComplete(step + 1)}
          disabled={closing}
          aria-label="Dismiss onboarding"
        >
          ✕
        </button>
      </div>

      <p className="text-sm text-slate-400 mt-3 leading-relaxed">{current.body}</p>

      <div className="flex items-center gap-4 mt-4">
        {/* Step dots */}
        <div className="flex items-center gap-1.5 flex-1">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-1 rounded-full transition-all duration-200 ${
                i === step
                  ? 'w-5 bg-amber-400'
                  : i < step
                  ? 'w-2 bg-amber-700/60'
                  : 'w-2 bg-gray-700'
              }`}
            />
          ))}
        </div>

        <div className="flex gap-2 shrink-0">
          {step > 0 && (
            <button
              className="btn-ghost text-xs py-1.5 px-3"
              onClick={() => setStep(s => s - 1)}
            >
              &larr; Back
            </button>
          )}
          <button
            className="btn-primary text-sm px-4 py-1.5"
            onClick={handleNext}
            disabled={closing}
          >
            {isLast ? '✓ Got it' : 'Next →'}
          </button>
        </div>
      </div>
    </div>
  )
}
