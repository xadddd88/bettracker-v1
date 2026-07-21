'use client'

import { useEffect, useRef } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'
import type { LucideIcon } from 'lucide-react'
import {
  Bot,
  Brain,
  ChevronDown,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Search,
  Settings,
  Target,
  TrendingUp,
  Wallet,
} from 'lucide-react'

const PRIMARY_NAV: { href: string; Icon: LucideIcon; label: string }[] = [
  { href: '/dashboard', Icon: LayoutDashboard, label: 'Home' },
  { href: '/ai', Icon: Bot, label: 'Scan' },
  { href: '/bets', Icon: Target, label: 'Tracker' },
  { href: '/analytics', Icon: TrendingUp, label: 'Stats' },
]

const SECONDARY_NAV: { href: string; Icon: LucideIcon; label: string }[] = [
  { href: '/decisions', Icon: ClipboardList, label: 'Decisions' },
  { href: '/scout', Icon: Search, label: 'Scout' },
  { href: '/coach', Icon: Brain, label: 'Coach' },
  { href: '/bankroll', Icon: Wallet, label: 'Bankroll' },
  { href: '/settings', Icon: Settings, label: 'Settings' },
]

export default function AppHeader({ user }: { user: User }) {
  const pathname = usePathname()
  const router = useRouter()
  const accountMenuRef = useRef<HTMLDetailsElement>(null)
  const initials = (user.email?.slice(0, 2) || 'BT').toUpperCase()

  useEffect(() => {
    accountMenuRef.current?.removeAttribute('open')
  }, [pathname])

  async function handleLogout() {
    accountMenuRef.current?.removeAttribute('open')
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <header className="relative z-40 shrink-0 border-b border-[var(--border-strong)] bg-[var(--night)] text-[var(--text-primary)]">
      <div className="mx-auto flex min-h-16 w-full max-w-[1600px] items-center gap-4 px-4 md:px-8">
        <Link
          href="/dashboard"
          aria-label="BetTracker home"
          className="flex min-h-11 shrink-0 items-center gap-2.5 rounded-[var(--radius-control)] focus:outline-none"
        >
          <span className="h-2.5 w-2.5 rounded-full bg-[var(--signal)]" aria-hidden />
          <span className="font-display text-lg font-black uppercase tracking-[-0.045em]">BetTracker</span>
        </Link>

        <nav className="hidden min-w-0 flex-1 items-center justify-center gap-1 md:flex" aria-label="Primary navigation">
          {PRIMARY_NAV.map(({ href, Icon, label }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`)
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-11 items-center gap-2 rounded-[var(--radius-control)] border px-3 text-xs font-extrabold uppercase tracking-[0.06em] transition-colors ${
                  active
                    ? 'border-[var(--signal)] bg-[var(--signal)] text-[var(--on-signal)]'
                    : 'border-transparent text-[var(--text-muted)] hover:border-[var(--border-strong)] hover:bg-[var(--field)] hover:text-[var(--text-primary)]'
                }`}
              >
                <Icon size={15} strokeWidth={1.9} aria-hidden />
                {label}
              </Link>
            )
          })}
        </nav>

        <details ref={accountMenuRef} className="group relative ml-auto">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-[var(--radius-control)] border border-[var(--border-strong)] bg-[var(--field)] px-2.5 text-[var(--text-muted)] marker:content-none hover:border-[var(--signal)] hover:text-[var(--text-primary)]">
            <span className="grid h-7 w-7 place-items-center rounded-full border border-[var(--border-strong)] font-mono text-[10px] font-black text-[var(--text-primary)]">
              {initials}
            </span>
            <span className="hidden text-[10px] font-extrabold uppercase tracking-[0.08em] sm:inline">Account</span>
            <ChevronDown className="transition-transform group-open:rotate-180" size={14} aria-hidden />
          </summary>

          <div className="absolute right-0 top-[calc(100%+8px)] w-64 overflow-hidden rounded-[var(--radius-control)] border border-[var(--border-strong)] bg-[var(--field)] shadow-2xl shadow-black/35">
            <div className="border-b border-[var(--border-subtle)] px-4 py-3">
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--text-quiet)]">Signed in</p>
              <p className="mt-1 truncate text-xs text-[var(--text-muted)]">{user.email}</p>
            </div>

            <nav className="p-2" aria-label="Tools navigation">
              {SECONDARY_NAV.map(({ href, Icon, label }) => {
                const active = pathname === href || pathname.startsWith(`${href}/`)
                return (
                  <Link
                    key={href}
                    href={href}
                    aria-current={active ? 'page' : undefined}
                    className={`flex min-h-11 items-center gap-3 rounded-[var(--radius-control)] px-3 text-xs font-bold uppercase tracking-[0.05em] ${
                      active
                        ? 'bg-[var(--field-raised)] text-[var(--signal)]'
                        : 'text-[var(--text-muted)] hover:bg-[var(--field-raised)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    <Icon size={15} strokeWidth={1.8} aria-hidden />
                    {label}
                  </Link>
                )
              })}
            </nav>

            <div className="border-t border-[var(--border-subtle)] p-2">
              <button
                type="button"
                onClick={handleLogout}
                className="flex min-h-11 w-full items-center justify-between rounded-[var(--radius-control)] px-3 text-xs font-bold uppercase tracking-[0.05em] text-[var(--negative)] hover:bg-[var(--field-raised)]"
              >
                Sign out
                <LogOut size={15} strokeWidth={1.8} aria-hidden />
              </button>
            </div>
          </div>
        </details>
      </div>
    </header>
  )
}
