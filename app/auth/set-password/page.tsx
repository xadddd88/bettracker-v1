'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { BroadcastButton, BroadcastPanel, BroadcastStatus } from '@/components/ui/BroadcastNoir'

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
    <main className="flex min-h-screen items-center justify-center bg-bn-night px-4 text-bn-text">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="mb-1 font-display text-3xl font-black">BetTracker</div>
          <div className="text-sm text-bn-muted">Set your password</div>
        </div>

        <BroadcastPanel className="p-4 sm:p-5">
          {!ready ? (
            <div aria-live="polite" className="py-4 text-center"><BroadcastStatus status="neutral">Loading</BroadcastStatus></div>
          ) : !hasSession ? (
            <div className="text-center py-4">
              <div className="mb-3 text-sm text-bn-muted">
                This page can only be opened from your invite email link.
              </div>
              <a href="/login" className="min-h-11 text-xs font-bold text-bn-text underline underline-offset-4">Go to sign in</a>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div>
                <label className="label" htmlFor="new-password">New password</label>
                <input
                  id="new-password"
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
                <label className="label" htmlFor="confirm-password">Confirm password</label>
                <input
                  id="confirm-password"
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
                <BroadcastStatus className="w-full" role="alert" status="negative">{error}</BroadcastStatus>
              )}

              <BroadcastButton type="submit" className="mt-1 w-full" disabled={submitting}>
                {submitting ? 'Saving…' : 'Set password & continue'}
              </BroadcastButton>
            </form>
          )}
        </BroadcastPanel>
      </div>
    </main>
  )
}
