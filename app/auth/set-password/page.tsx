'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

// Decision #050 — invite completion. Reached only via the emailed invite
// link (which established an authenticated session in /auth/callback). The
// invitee sets a password here; on success the beta_access invite is
// consumed and they land on the dashboard. Without a valid session (i.e.
// someone who navigates here directly) the form is blocked.
export default function SetPasswordPage() {
  const router = useRouter()
  const supabase = createClient()

  const [ready, setReady]         = useState(false)
  const [hasSession, setHasSession] = useState(false)
  const [password, setPassword]   = useState('')
  const [confirm, setConfirm]     = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError]         = useState('')

  useEffect(() => {
    let active = true
    supabase.auth.getUser().then(({ data }) => {
      if (!active) return
      setHasSession(Boolean(data.user))
      setReady(true)
    })
    return () => { active = false }
  }, [supabase])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return }
    if (password !== confirm) { setError('Passwords do not match.'); return }

    setSubmitting(true)
    try {
      const { error: updErr } = await supabase.auth.updateUser({ password })
      if (updErr) throw new Error(updErr.message)

      // Consume the invite (marks beta_access used for this authenticated user).
      const res = await fetch('/api/auth/complete-invite', { method: 'POST' })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.error ?? 'Could not finish setup. Please try again.')
      }

      router.push('/dashboard')
      router.refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950 px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-3xl font-bold text-white mb-1">BetTracker</div>
          <div className="text-sm text-gray-500">Set your password</div>
        </div>

        <div className="card">
          {!ready ? (
            <div className="text-center text-sm text-gray-400 py-4">Loading…</div>
          ) : !hasSession ? (
            <div className="text-center py-4">
              <div className="text-sm text-gray-300 mb-3">
                This page can only be opened from your invite email link.
              </div>
              <a href="/login" className="text-xs text-indigo-400 hover:text-indigo-300">Go to sign in</a>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div>
                <label className="label">New password</label>
                <input
                  className="input"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={8}
                  required
                />
              </div>
              <div>
                <label className="label">Confirm password</label>
                <input
                  className="input"
                  type="password"
                  placeholder="••••••••"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  minLength={8}
                  required
                />
              </div>

              {error && (
                <div className="text-xs text-red-400 bg-red-950/40 border border-red-900 rounded-lg px-3 py-2">
                  {error}
                </div>
              )}

              <button type="submit" className="btn-primary w-full mt-1" disabled={submitting}>
                {submitting ? 'Saving…' : 'Set password & continue'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
