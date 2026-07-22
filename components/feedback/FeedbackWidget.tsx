'use client'

import { useEffect, useRef, useState } from 'react'
import { MessageSquarePlus, Star, X } from 'lucide-react'
import { trackClientEvent } from '@/lib/analytics/client'
import { EVENTS } from '@/lib/analytics/events'
import { BroadcastStatus } from '@/components/ui/BroadcastNoir'

type Category = 'bug' | 'suggestion' | 'general' | 'praise'

const CATEGORIES: { value: Category; label: string }[] = [
  { value: 'bug',        label: 'Bug' },
  { value: 'suggestion', label: 'Suggestion' },
  { value: 'praise',     label: 'Praise' },
  { value: 'general',    label: 'General' },
]

const DIALOG_TITLE_ID = 'feedback-dialog-title'

export default function FeedbackWidget() {
  const [open,     setOpen]     = useState(false)
  const [rating,   setRating]   = useState(0)
  const [hovered,  setHovered]  = useState(0)
  const [category, setCategory] = useState<Category>('general')
  const [message,  setMessage]  = useState('')
  const [loading,  setLoading]  = useState(false)
  const [done,     setDone]     = useState(false)
  const [error,    setError]    = useState('')
  const dialogRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialogRef.current?.querySelector<HTMLElement>('button, textarea')?.focus()

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        closeModal()
        return
      }
      if (event.key !== 'Tab') return

      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), textarea:not([disabled])'
      )
      if (!focusable?.length) return
      const items = Array.from(focusable)
      const first = items[0]
      const last = items[items.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

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
        type="button"
        onClick={openModal}
        className="bn-button bn-button-secondary fixed bottom-20 right-0 z-40 rounded-r-none border-r-0 md:bottom-6"
        aria-label="Open feedback form"
      >
        <MessageSquarePlus aria-hidden="true" className="h-4 w-4" />
        <span>Feedback</span>
      </button>

      {/* Backdrop + dialog */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center"
          onClick={e => { if (e.target === e.currentTarget) closeModal() }}
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={DIALOG_TITLE_ID}
            className="w-full max-w-md overflow-hidden border border-[var(--border-strong)] bg-[var(--field)] text-[var(--text-primary)]"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[var(--border-strong)] px-5 py-4">
              <h2 id={DIALOG_TITLE_ID} className="font-display text-xl font-black uppercase tracking-[-0.04em]">Beta feedback</h2>
              <button
                type="button"
                onClick={closeModal}
                className="bn-button bn-button-secondary min-w-11 px-0"
                aria-label="Close"
              >
                <X aria-hidden="true" className="h-4 w-4" />
              </button>
            </div>

            {done ? (
              <div className="px-5 py-10 text-center">
                <BroadcastStatus status="success">Feedback received</BroadcastStatus>
                <p className="mt-5 text-sm font-semibold text-[var(--text-primary)]">Thank you.</p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">Your feedback helps us build a better product.</p>
                <button className="bn-button bn-button-primary mt-5 w-full" onClick={closeModal}>
                  Close
                </button>
              </div>
            ) : (
              <div className="px-5 py-4 flex flex-col gap-4">
                {/* Star rating */}
                <div>
                  <p className="label mb-2">How&apos;s BetTracker working for you?</p>
                  <div
                    className="flex gap-1"
                    onMouseLeave={() => setHovered(0)}
                  >
                    {[1, 2, 3, 4, 5].map(n => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setRating(n)}
                        onMouseEnter={() => setHovered(n)}
                        className={`flex min-h-11 min-w-11 items-center justify-center border transition-colors ${
                          n <= activeRating
                            ? 'border-[var(--signal)] text-[var(--signal)]'
                            : 'border-[var(--border-strong)] text-[var(--text-quiet)]'
                        }`}
                        aria-pressed={rating === n}
                        aria-label={`${n} star${n === 1 ? '' : 's'}`}
                      >
                        <Star aria-hidden="true" className="h-5 w-5" fill={n <= activeRating ? 'currentColor' : 'none'} />
                      </button>
                    ))}
                  </div>
                </div>

                {/* Category pills */}
                <div>
                  <p className="label mb-2">Type</p>
                  <div className="flex flex-wrap gap-2">
                    {CATEGORIES.map(c => (
                      <button
                        key={c.value}
                        type="button"
                        onClick={() => setCategory(c.value)}
                        aria-pressed={category === c.value}
                        className={`bn-button ${
                          category === c.value
                            ? 'bn-button-primary'
                            : 'bn-button-secondary'
                        }`}
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Message */}
                <div>
                  <p className="label mb-2">
                    Message{' '}
                    <span className="font-normal text-[var(--text-quiet)]">(optional)</span>
                  </p>
                  <textarea
                    className="input resize-none text-sm"
                    rows={3}
                    placeholder="Tell us anything…"
                    value={message}
                    maxLength={2000}
                    onChange={e => setMessage(e.target.value)}
                  />
                </div>

                {error && <p className="text-xs text-[var(--negative)]" role="alert">{error}</p>}

                <button
                  className="bn-button bn-button-primary w-full"
                  onClick={submit}
                  disabled={loading}
                >
                  {loading ? 'Sending…' : 'Send feedback'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
