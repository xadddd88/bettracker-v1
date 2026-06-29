'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import { trackClientEvent } from '@/lib/analytics/client'
import { EVENTS } from '@/lib/analytics/events'

type FeedbackType = 'bug' | 'idea' | 'confusing' | 'other'

const TYPES: { value: FeedbackType; label: string }[] = [
  { value: 'bug',       label: '🐛 Bug' },
  { value: 'idea',      label: '💡 Idea' },
  { value: 'confusing', label: '😕 Confusing' },
  { value: 'other',     label: '💬 Other' },
]

export default function FeedbackWidget() {
  const pathname = usePathname()

  const [open,    setOpen]    = useState(false)
  const [type,    setType]    = useState<FeedbackType>('idea')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [done,    setDone]    = useState(false)
  const [error,   setError]   = useState('')

  function openModal() {
    setOpen(true)
    setDone(false)
    setError('')
    trackClientEvent(EVENTS.BETA_FEEDBACK_OPENED, { page_path: pathname })
  }

  function closeModal() {
    setOpen(false)
    setType('idea')
    setMessage('')
    setError('')
  }

  async function submit() {
    if (!message.trim()) { setError('Please enter a message.'); return }
    setLoading(true)
    setError('')
    try {
      const res  = await fetch('/api/feedback', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ feedback_type: type, message: message.trim(), page_path: pathname }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) { setError(json.error ?? 'Failed to submit.'); return }
      setDone(true)
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {/* Sidebar trigger — styled to match other sidebar nav items */}
      <button
        onClick={openModal}
        className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-night-800 transition-colors"
      >
        <span className="text-base">💬</span>
        Feedback
      </button>

      {/* Modal */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={e => { if (e.target === e.currentTarget) closeModal() }}
        >
          <div className="w-full max-w-sm bg-gray-900 rounded-xl border border-gray-700 shadow-2xl overflow-hidden">
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
                <p className="text-xs text-slate-400 mt-1">Your feedback helps us improve.</p>
                <button className="mt-5 btn-primary w-full text-sm" onClick={closeModal}>
                  Close
                </button>
              </div>
            ) : (
              <div className="px-5 py-4 flex flex-col gap-4">
                {/* Type */}
                <div>
                  <p className="label mb-2">Type</p>
                  <div className="flex flex-wrap gap-2">
                    {TYPES.map(t => (
                      <button
                        key={t.value}
                        onClick={() => setType(t.value)}
                        className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                          type === t.value
                            ? 'border-amber-600 bg-amber-600/10 text-amber-400'
                            : 'border-gray-600 text-slate-400 hover:border-slate-500 hover:text-slate-300'
                        }`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Message */}
                <div>
                  <p className="label mb-2">Message</p>
                  <textarea
                    className="input resize-none text-sm"
                    rows={4}
                    placeholder="Tell us anything…"
                    value={message}
                    maxLength={2000}
                    onChange={e => setMessage(e.target.value)}
                  />
                </div>

                <p className="text-xs text-slate-600">Page: {pathname}</p>

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
