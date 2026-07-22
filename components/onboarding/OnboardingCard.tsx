'use client'

import { useState, useEffect } from 'react'
import { trackClientEvent } from '@/lib/analytics/client'
import { EVENTS } from '@/lib/analytics/events'

const STEPS = [
  {
    index: '01',
    title: 'Capture the coupon',
    body: 'Scan a screenshot into a reviewable draft. Scanner output never saves a bet automatically.',
  },
  {
    index: '02',
    title: 'Verify every field',
    body: 'Check the event, market, selection, odds and stake against the original coupon before saving.',
  },
  {
    index: '03',
    title: 'Track the record',
    body: 'Single and Express records stay editable until you choose to save them to the Tracker.',
  },
  {
    index: '04',
    title: 'Record known outcomes',
    body: 'Portfolio statistics use only saved stakes and recorded settlement outcomes. Missing data remains visibly unresolved.',
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
    <aside className="bn-panel p-4 sm:p-5" aria-label="BetTracker orientation">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center border border-[var(--border-strong)] bg-[var(--field-raised)] font-mono text-xs font-black text-[var(--signal)]">{current.index}</span>
          <div className="min-w-0">
            <p className="font-mono text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--text-quiet)]">
              Founder orientation / {step + 1} of {STEPS.length}
            </p>
            <h2 className="mt-1 text-base font-black text-[var(--text-primary)]">{current.title}</h2>
          </div>
        </div>
        <button
          className="flex min-h-11 min-w-11 shrink-0 items-center justify-center border border-transparent text-sm font-bold text-[var(--text-muted)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
          onClick={() => markComplete(step + 1)}
          disabled={closing}
          aria-label="Dismiss onboarding"
        >
          ✕
        </button>
      </div>

      <p className="mt-4 max-w-2xl text-sm leading-6 text-[var(--text-muted)]">{current.body}</p>

      <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="flex items-center gap-1.5 flex-1">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-1 transition-all duration-200 ${
                i === step
                  ? 'w-6 bg-[var(--signal)]'
                  : i < step
                  ? 'w-3 bg-[var(--text-muted)]'
                  : 'w-3 bg-[var(--border-subtle)]'
              }`}
            />
          ))}
        </div>

        <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
          {step > 0 && (
            <button
              className="btn-ghost w-full sm:w-auto"
              onClick={() => setStep(s => s - 1)}
            >
              Back
            </button>
          )}
          <button
            className="btn-primary w-full sm:w-auto"
            onClick={handleNext}
            disabled={closing}
          >
            {isLast ? 'Finish' : 'Next'}
          </button>
        </div>
      </div>
    </aside>
  )
}
