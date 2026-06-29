'use client'

import { useState } from 'react'
import { trackClientEvent } from '@/lib/analytics/client'
import { EVENTS } from '@/lib/analytics/events'

type Category = 'bug' | 'suggestion' | 'general' | 'praise'

const CATEGORIES: { value: Category; label: string }[] = [
  { value: 'bug',        label: '🐛 Bug' },
  { value: 'suggestion', label: '💡 Suggestion' },
  { value: 'praise',     label: '⭐ Praise' },
  { value: 'general',    label: '💬 General' },
]

export default function FeedbackWidget() {
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
        onClick={openModal}
        className="fixed bottom-20 right-4 md:bottom-6 md:right-6 z-40 bg-gray-900 border border-gray-700 hover:border-amber-600/60 text-slate-400 hover:text-amber-400 rounded-full px-3 py-1.5 text-xs font-medium shadow-lg transition-all flex items-center gap-1.5"
        aria-label="Open feedback form"
      >
        <span>💬</span>
        <span className="hidden sm:inline">Feedback</span>
      </button>

      {/* Backdrop + dialog */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={e => { if (e.target === e.currentTarget) closeModal() }}
        >
          <div className="w-full max-w-sm bg-gray-900 rounded-xl border border-gray-700 shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700">
              <h2 className="text-sm font-semibold text-white">Beta Feedback</h2>
              <button
                onClick={closeModal}
                className="text-slate-500 hover:text-slate-300 text-xs transition-colors"
                aria-label="Close"
              >
                &#x2715;
              </button>
            </div>

            {done ? (
              <div className="px-5 py-10 text-center">
                <div className="text-4xl mb-3">🙏</div>
                <p className="text-sm font-semibold text-white">Thank you!</p>
                <p className="text-xs text-slate-400 mt-1">Your feedback helps us build a better product.</p>
                <button className="mt-5 btn-primary w-full text-sm" onClick={closeModal}>
                  Close
                </button>
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
                        className={`text-2xl transition-all hover:scale-110 ${
                          n <= activeRating ? 'opacity-100' : 'opacity-25'
                        }`}
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
                      <button
                        key={c.value}
                        onClick={() => setCategory(c.value)}
                        className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                          category === c.value
                            ? 'border-amber-600 bg-amber-600/10 text-amber-400'
                            : 'border-gray-600 text-slate-400 hover:border-slate-500 hover:text-slate-300'
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
                    <span className="text-slate-600 font-normal">(optional)</span>
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

                {error && <p className="text-xs text-red-400">{error}</p>}

                <button
                  className="btn-primary w-full"
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
