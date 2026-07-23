'use client'

import { useEffect, useRef, useState } from 'react'
import { trackClientEvent } from '@/lib/analytics/client'
import { EVENTS } from '@/lib/analytics/events'
import { BroadcastButton, BroadcastPanel, BroadcastStatus } from '@/components/ui/BroadcastNoir'

type Category = 'bug' | 'suggestion' | 'general' | 'praise'

const CATEGORIES: { value: Category; label: string }[] = [
  { value: 'bug',        label: '🐛 Bug' },
  { value: 'suggestion', label: '💡 Suggestion' },
  { value: 'praise',     label: '⭐ Praise' },
  { value: 'general',    label: '💬 General' },
]

export default function FeedbackWidget() {
  const triggerRef = useRef<HTMLButtonElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const successRef = useRef<HTMLDivElement>(null)
  const [open,     setOpen]     = useState(false)
  const [rating,   setRating]   = useState(0)
  const [hovered,  setHovered]  = useState(0)
  const [category, setCategory] = useState<Category>('general')
  const [message,  setMessage]  = useState('')
  const [loading,  setLoading]  = useState(false)
  const [done,     setDone]     = useState(false)
  const [error,    setError]    = useState('')

  function openModal() {
    setOpen(true)
    setDone(false)
    setError('')
    trackClientEvent(EVENTS.BETA_FEEDBACK_OPENED, {})
  }

  function closeModal() {
    setOpen(false)
    setRating(0)
    setHovered(0)
    setCategory('general')
    setMessage('')
    setError('')
    requestAnimationFrame(() => triggerRef.current?.focus())
  }

  useEffect(() => {
    if (!open) return
    closeRef.current?.focus()
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        closeModal()
        return
      }
      if (event.key !== 'Tab') return

      const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      ) ?? []).filter(element => element.getAttribute('aria-hidden') !== 'true')
      if (!focusable.length) {
        event.preventDefault()
        return
      }

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const focusIsOutside = !dialogRef.current?.contains(document.activeElement)
      if (event.shiftKey && (document.activeElement === first || focusIsOutside)) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && (document.activeElement === last || focusIsOutside)) {
        event.preventDefault()
        first.focus()
      }
    }
    function containFocus(event: FocusEvent) {
      if (!dialogRef.current?.contains(event.target as Node)) closeRef.current?.focus()
    }
    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('focusin', containFocus)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('focusin', containFocus)
    }
  }, [open])

  useEffect(() => {
    if (open && done) successRef.current?.focus()
  }, [done, open])

  async function submit() {
    if (rating === 0) {
      setError('Please select a rating.')
      return
    }
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/feedback', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ rating, category, message: message.trim() || undefined }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        setError(json.error ?? 'Failed to submit. Please try again.')
        return
      }
      setDone(true)
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const activeRating = hovered || rating

  return (
    <>
      {/* Floating trigger — clears mobile bottom nav on small screens */}
      <button
        ref={triggerRef}
        onClick={openModal}
        className="fixed bottom-20 right-0 z-40 flex min-h-11 items-center gap-2 rounded-l-control border border-bn-border-strong bg-bn-field px-4 font-mono text-[9px] font-black uppercase tracking-[0.12em] text-bn-text transition-colors hover:border-bn-signal hover:bg-bn-raised md:bottom-6"
        aria-label="Open feedback form"
      >
        <span aria-hidden>+</span>
        <span>Feedback</span>
      </button>

      {/* Backdrop + dialog */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-bn-night/90 p-4 sm:items-center"
          onClick={e => { if (e.target === e.currentTarget) closeModal() }}
        >
          <div className="w-full max-w-sm" ref={dialogRef}>
          <BroadcastPanel aria-labelledby="feedback-title" aria-modal="true" className="w-full overflow-hidden" role="dialog">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-bn-border-strong px-5 py-4">
              <h2 id="feedback-title" className="font-display text-lg font-black uppercase tracking-[-0.04em] text-bn-text">Beta feedback</h2>
              <button
                ref={closeRef}
                onClick={closeModal}
                className="min-h-11 min-w-11 rounded-control text-xs text-bn-text transition-colors hover:bg-bn-raised"
                aria-label="Close"
              >
                &#x2715;
              </button>
            </div>

            {done ? (
              <div ref={successRef} className="px-5 py-10 text-center" tabIndex={-1}>
                <BroadcastStatus status="success">Feedback sent</BroadcastStatus>
                <p className="mt-3 text-sm font-semibold text-bn-text">Thank you!</p>
                <p className="mt-1 text-xs text-bn-muted">Your feedback helps us build a better product.</p>
                <BroadcastButton className="mt-5 w-full" onClick={closeModal}>
                  Close
                </BroadcastButton>
              </div>
            ) : (
              <div className="px-5 py-4 flex flex-col gap-4">
                {/* Star rating */}
                <div>
                  <p className="label mb-2">How&apos;s BetTracker AI working for you?</p>
                  <div
                    className="flex gap-1"
                    onMouseLeave={() => setHovered(0)}
                  >
                    {[1, 2, 3, 4, 5].map(n => (
                      <button
                        key={n}
                        onClick={() => setRating(n)}
                        onMouseEnter={() => setHovered(n)}
                        aria-pressed={rating === n}
                        className={`min-h-11 min-w-11 rounded-control border text-xl transition-colors ${n <= activeRating ? 'border-bn-signal bg-bn-raised opacity-100' : 'border-bn-border-subtle opacity-60'}`}
                        aria-label={`${n} star${n === 1 ? '' : 's'}`}
                      >
                        ⭐
                      </button>
                    ))}
                  </div>
                </div>

                {/* Category pills */}
                <div>
                  <p className="label mb-2">Type</p>
                  <div className="flex flex-wrap gap-2">
                    {CATEGORIES.map(c => (
                      <BroadcastButton
                        key={c.value}
                        onClick={() => setCategory(c.value)}
                        aria-pressed={category === c.value}
                        tone={category === c.value ? 'primary' : 'secondary'}
                      >
                        {c.label}
                      </BroadcastButton>
                    ))}
                  </div>
                </div>

                {/* Message */}
                <div>
                  <label className="label mb-2 block" htmlFor="feedback-message">
                    Message{' '}
                    <span className="font-normal text-bn-quiet">(optional)</span>
                  </label>
                  <textarea
                    id="feedback-message"
                    className="input resize-none text-sm"
                    rows={3}
                    placeholder="Tell us anything…"
                    value={message}
                    maxLength={2000}
                    onChange={e => setMessage(e.target.value)}
                  />
                </div>

                {error && <BroadcastStatus className="w-full" status="negative">{error}</BroadcastStatus>}

                <BroadcastButton
                  className="w-full"
                  onClick={submit}
                  disabled={loading}
                >
                  {loading ? 'Sending…' : 'Send feedback'}
                </BroadcastButton>
              </div>
            )}
          </BroadcastPanel>
          </div>
        </div>
      )}
    </>
  )
}
