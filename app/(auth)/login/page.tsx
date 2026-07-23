'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { BroadcastButton, BroadcastPanel, BroadcastStatus } from '@/components/ui/BroadcastNoir'

type Mode = 'login' | 'register' | 'magic'

const MODES: { label: string; value: Mode }[] = [
  { label: 'Sign in', value: 'login' },
  { label: 'Register', value: 'register' },
  { label: 'Magic link', value: 'magic' },
]

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [mode, setMode] = useState<Mode>('login')
  const [magicSent, setMagicSent] = useState(false)
  const [successMsg, setSuccessMsg] = useState('')
  const router = useRouter()
  const supabase = createClient()

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setLoading(true)
    setError('')

    try {
      if (mode === 'magic') {
        const { error: authError } = await supabase.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: `${window.location.origin}/auth/callback`, shouldCreateUser: false },
        })
        if (authError) throw authError
        setMagicSent(true)
      } else if (mode === 'register') {
        const response = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        })
        const json = await response.json()
        if (!response.ok) throw new Error(json.error ?? 'Something went wrong. Please try again.')
        setSuccessMsg(json.message)
      } else {
        const { error: authError } = await supabase.auth.signInWithPassword({ email, password })
        if (authError) throw authError
        router.push('/dashboard')
        router.refresh()
      }
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  function selectMode(nextMode: Mode) {
    setMode(nextMode)
    setError('')
    setMagicSent(false)
    setSuccessMsg('')
  }

  const submitLabel = loading
    ? 'Working…'
    : mode === 'magic'
      ? 'Send magic link'
      : mode === 'register'
        ? 'Send invite link'
        : 'Enter workspace'

  return (
    <main className="web-editorial grid min-h-screen bg-[var(--night)] lg:grid-cols-[minmax(0,1.35fr)_minmax(420px,0.65fr)]">
      <section className="relative flex min-h-[44vh] flex-col overflow-hidden border-b border-[var(--border-strong)] bg-[var(--night)] p-5 text-[var(--text-primary)] lg:min-h-screen lg:border-b-0 lg:border-r lg:p-10">
        <div className="pointer-events-none absolute -bottom-8 -left-5 select-none font-display text-[clamp(8rem,24vw,24rem)] font-black leading-none tracking-[-0.1em] text-bn-raised/30" aria-hidden>
          BETTRACKER
        </div>
        <header className="relative z-10 flex min-h-12 items-center border-y border-bn-border-strong">
          <div className="font-display text-xl font-black tracking-[-0.045em] text-[var(--text-primary)]">BETTRACKER</div>
          <div className="ml-4 flex-1 font-mono text-[9px] font-bold tracking-[0.14em] text-[var(--text-quiet)]">SHARED VISUAL SYSTEM / V3.1</div>
          <div className="h-2.5 w-2.5 rounded-control bg-[var(--signal)]" aria-hidden />
        </header>
        <div className="relative z-10 my-auto py-12 lg:py-20">
          <p className="font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--signal)]">Private decision intelligence</p>
          <h1 className="mt-6 max-w-4xl font-display text-[clamp(3.2rem,7vw,8rem)] font-black uppercase leading-[0.8] tracking-[-0.075em] text-bn-text">
            Evidence<br />before<br />action
          </h1>
          <p className="mt-8 max-w-md text-sm leading-6 text-bn-muted">
            Analyze the signal. Keep every coupon leg in order. Build a record you can trust.
          </p>
        </div>
        <div className="relative z-10 grid grid-cols-3 border-y border-bn-border-strong py-4 font-mono text-[8px] font-bold uppercase tracking-[0.15em] text-bn-muted">
          <span>01 / Scan</span>
          <span className="text-center">02 / Verify</span>
          <span className="text-right">03 / Track</span>
        </div>
      </section>

      <section className="flex items-center bg-[var(--field)] px-5 py-10 text-[var(--text-primary)] md:px-10 lg:px-12">
        <div className="editorial-page w-full max-w-xl lg:mx-auto">
          <div className="flex items-end justify-between border-b border-[var(--border-strong)] pb-4">
            <div className="min-w-0">
              <p className="editorial-kicker">Access / BetTracker</p>
              <h2 className="mt-3 font-display text-[clamp(2.7rem,4.8vw,4rem)] font-black uppercase leading-[0.83] tracking-[-0.07em]">
                Founder<br />workspace
              </h2>
            </div>
            <span className="mb-1 h-3 w-3 rounded-control bg-[var(--signal)]" aria-hidden />
          </div>

          <div className="mt-8 grid grid-cols-3 overflow-hidden rounded-[var(--radius-control)] border border-[var(--border-strong)]">
            {MODES.map(item => (
              <button
                key={item.value}
                type="button"
                onClick={() => selectMode(item.value)}
                aria-pressed={mode === item.value}
                className={`min-h-12 border-r border-[var(--border-strong)] px-2 font-mono text-[10px] font-black uppercase tracking-[0.06em] transition-colors last:border-r-0 ${
                  mode === item.value
                    ? 'bg-[var(--signal)] text-[var(--on-signal)]'
                    : 'bg-[var(--field)] text-[var(--text-muted)] hover:bg-[var(--field-raised)] hover:text-[var(--text-primary)]'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          {magicSent ? (
            <BroadcastPanel className="mt-8 border-bn-success p-6">
              <BroadcastStatus status="success">Sent</BroadcastStatus>
              <p className="mt-5 font-display text-3xl font-black uppercase tracking-[-0.05em]">Check your inbox</p>
              <p className="mt-3 text-sm text-[var(--text-muted)]">The secure login link is waiting in your email.</p>
            </BroadcastPanel>
          ) : (
            <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-5">
              <div>
                <label className="label" htmlFor="login-email">Email</label>
                <input
                  id="login-email"
                  className="input"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={event => setEmail(event.target.value)}
                  autoComplete="email"
                  required
                />
              </div>

              {mode === 'login' && (
                <div>
                  <label className="label" htmlFor="login-password">Password</label>
                  <input
                    id="login-password"
                    className="input"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={event => setPassword(event.target.value)}
                    autoComplete="current-password"
                    required
                  />
                </div>
              )}

              {mode === 'register' && (
                <p className="rounded-[var(--radius-control)] border-l-4 border-[var(--signal)] bg-[var(--field-raised)] px-4 py-3 text-xs leading-5 text-[var(--text-muted)]">
                  Beta access is invite-only. We will email a secure link so you can set your password.
                </p>
              )}

              {error && (
                <BroadcastStatus className="w-full" role="alert" status="negative">{error}</BroadcastStatus>
              )}

              {successMsg && (
                <BroadcastStatus className="w-full" role="status" status="success">{successMsg}</BroadcastStatus>
              )}

              <BroadcastButton type="submit" className="mt-2 min-h-14 w-full" disabled={loading}>
                {submitLabel}
                <span aria-hidden>↗</span>
              </BroadcastButton>
            </form>
          )}

          <p className="mt-8 border-t border-[var(--border-strong)] pt-4 font-mono text-[9px] font-bold uppercase tracking-[0.1em] text-[var(--text-quiet)]">
            Secure account access / No public betting execution
          </p>
        </div>
      </section>
    </main>
  )
}
