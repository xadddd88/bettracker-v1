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
  Calculator,
  ChevronDown,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  PlusCircle,
  Search,
  Settings,
  Target,
  TrendingUp,
  Wallet,
} from 'lucide-react'

type NavItem = { href: string; Icon: LucideIcon; label: string; aliases?: string[] }

const PRIMARY_NAV: NavItem[] = [
  { href: '/dashboard', Icon: LayoutDashboard, label: 'Главная' },
  { href: '/scout', Icon: Search, label: 'Исследование', aliases: ['/ai'] },
  { href: '/decisions', Icon: ClipboardList, label: 'Журнал', aliases: ['/bets'] },
  { href: '/analytics', Icon: TrendingUp, label: 'Аналитика', aliases: ['/coach'] },
  { href: '/bankroll', Icon: Wallet, label: 'Риск' },
]

const SECONDARY_NAV: NavItem[] = [
  { href: '/ai', Icon: Bot, label: 'Добавить / скан' },
  { href: '/bets', Icon: Target, label: 'Журнал: ставки' },
  { href: '/coach', Icon: Brain, label: 'Разбор' },
  { href: '/settings', Icon: Settings, label: 'Настройки' },
]

function isActive(pathname: string, item: NavItem): boolean {
  return [item.href, ...(item.aliases ?? [])].some((route) => pathname === route || pathname.startsWith(`${route}/`))
}

export default function AppHeader({
  user,
  tennisCalcEnabled,
}: {
  user: User
  tennisCalcEnabled: boolean
}) {
  const pathname = usePathname()
  const router = useRouter()
  const accountMenuRef = useRef<HTMLDetailsElement>(null)
  const initials = (user.email?.slice(0, 2) || 'BT').toUpperCase()
  const secondaryNav = tennisCalcEnabled
    ? [
        ...SECONDARY_NAV.slice(0, -1),
        { href: '/tennis-calculator', Icon: Calculator, label: 'Серия 40:40' },
        SECONDARY_NAV[SECONDARY_NAV.length - 1],
      ]
    : SECONDARY_NAV

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
          aria-label="Главная BetTracker"
          className="flex min-h-11 shrink-0 items-center gap-2.5 rounded-[var(--radius-control)] focus:outline-none"
        >
          <span className="h-2.5 w-2.5 rounded-control bg-[var(--signal)]" aria-hidden />
          <span className="font-display text-lg font-black uppercase tracking-[-0.045em]">BetTracker</span>
        </Link>

        <nav className="hidden min-w-0 flex-1 items-center justify-center gap-1 md:flex" aria-label="Основная навигация">
          {PRIMARY_NAV.map((item) => {
            const { href, Icon, label } = item
            const active = isActive(pathname, item)
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

        <Link
          href="/ai"
          className="hidden min-h-11 shrink-0 items-center gap-2 rounded-[var(--radius-control)] border border-[var(--signal)] bg-[var(--signal)] px-3 text-xs font-extrabold uppercase tracking-[0.06em] text-[var(--on-signal)] transition-colors hover:brightness-95 sm:flex"
        >
          <PlusCircle size={15} strokeWidth={1.9} aria-hidden />
          Добавить
        </Link>

        <details ref={accountMenuRef} className="group relative ml-auto">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-[var(--radius-control)] border border-[var(--border-strong)] bg-[var(--field)] px-2.5 text-[var(--text-muted)] marker:content-none hover:border-[var(--signal)] hover:text-[var(--text-primary)]">
            <span className="grid h-7 w-7 place-items-center rounded-control border border-[var(--border-strong)] font-mono text-[11px] font-black text-[var(--text-primary)]">
              {initials}
            </span>
            <span className="hidden text-[11px] font-extrabold uppercase tracking-[0.06em] sm:inline">Аккаунт</span>
            <ChevronDown className="transition-transform group-open:rotate-180" size={14} aria-hidden />
          </summary>

          <div className="absolute right-0 top-[calc(100%+8px)] w-64 overflow-hidden rounded-[var(--radius-control)] border border-[var(--border-strong)] bg-[var(--field)] shadow-2xl shadow-black/35">
            <div className="border-b border-[var(--border-subtle)] px-4 py-3">
              <p className="font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-quiet)]">Вход выполнен</p>
              <p className="mt-1 truncate text-xs text-[var(--text-muted)]">{user.email}</p>
            </div>

            <nav className="p-2" aria-label="Навигация инструментов">
              {secondaryNav.map((item) => {
                const { href, Icon, label } = item
                const active = isActive(pathname, item)
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
                Выйти
                <LogOut size={15} strokeWidth={1.8} aria-hidden />
              </button>
            </div>
          </div>
        </details>
      </div>
    </header>
  )
}
