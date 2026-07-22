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
    <main className="web-editorial flex min-h-screen items-center justify-center bg-[var(--night)] px-4 py-10 text-[var(--text-primary)]">
      <div className="editorial-page w-full max-w-md">
        <header className="mb-8 border-y border-[var(--border-strong)] py-6 text-center">
          <p className="editorial-kicker">Secure account setup</p>
          <h1 className="mt-3 font-display text-4xl font-black uppercase tracking-[-0.05em]">BetTracker</h1>
          <p className="mt-2 text-sm text-[var(--text-muted)]">Set your password</p>
        </header>

        <section className="bn-panel p-5 sm:p-6" aria-live="polite">
          {!ready ? (
            <div className="py-4 text-center text-sm text-[var(--text-muted)]">Loading…</div>
          ) : !hasSession ? (
            <div className="py-4 text-center">
              <p className="mb-4 text-sm leading-6 text-[var(--text-muted)]">
                This page can only be opened from your invite email link.
              </p>
              <a href="/login" className="bn-button bn-button-secondary">Go to sign in</a>
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
                  autoComplete="new-password"
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
                  autoComplete="new-password"
                  minLength={8}
                  required
                />
              </div>

              {error && (
                <div className="bn-status bn-status-negative w-full justify-start" role="alert">
                  <span className="bn-status-icon" aria-hidden>×</span>
                  <span>{error}</span>
                </div>
              )}

              <button type="submit" className="bn-button bn-button-primary mt-1 w-full" disabled={submitting}>
                {submitting ? 'Saving…' : 'Set password & continue'}
              </button>
            </form>
          )}
        </section>
      </div>
    </main>
  )
}
