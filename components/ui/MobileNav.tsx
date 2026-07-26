'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { LucideIcon } from 'lucide-react'
import {
  Bot,
  Brain,
  Calculator,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  MoreHorizontal,
  Search,
  Settings,
  Target,
  TrendingUp,
  Wallet,
} from 'lucide-react'

const NAV: { href: string; Icon: LucideIcon; label: string }[] = [
  { href: '/dashboard', Icon: LayoutDashboard, label: 'Главная' },
  { href: '/ai', Icon: Bot, label: 'Скан' },
  { href: '/bets', Icon: Target, label: 'Ставки' },
  { href: '/analytics', Icon: TrendingUp, label: 'Статистика' },
]

const MORE_LINKS: { href: string; Icon: LucideIcon; label: string }[] = [
  { href: '/decisions', Icon: ClipboardList, label: 'Решения' },
  { href: '/scout', Icon: Search, label: 'Скаут' },
  { href: '/coach', Icon: Brain, label: 'Коуч' },
  { href: '/bankroll', Icon: Wallet, label: 'Банкролл' },
  { href: '/settings', Icon: Settings, label: 'Настройки' },
]

const MORE_ROUTES = MORE_LINKS.map(link => link.href)
const SHEET_ID = 'mobile-nav-more-sheet'

export default function MobileNav({ tennisCalcEnabled }: { tennisCalcEnabled: boolean }) {
  const pathname = usePathname()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const sheetRef = useRef<HTMLDivElement>(null)
  const moreButtonRef = useRef<HTMLButtonElement>(null)
  const moreLinks = tennisCalcEnabled
    ? [
        ...MORE_LINKS.slice(0, -1),
        { href: '/tennis-calculator', Icon: Calculator, label: 'Серия 40:40' },
        MORE_LINKS[MORE_LINKS.length - 1],
      ]
    : MORE_LINKS
  const moreRoutes = tennisCalcEnabled
    ? [...MORE_ROUTES, '/tennis-calculator']
    : MORE_ROUTES
  const moreActive = moreRoutes.some(route => pathname === route || pathname.startsWith(`${route}/`))

  useEffect(() => setOpen(false), [pathname])

  useEffect(() => {
    if (!open) return

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false)
        moreButtonRef.current?.focus()
        return
      }

      if (event.key !== 'Tab') return
      const focusables = sheetRef.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled])')
      if (!focusables?.length) return
      const list = Array.from(focusables)
      const first = list[0]
      const last = list[list.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open])

  useEffect(() => {
    if (open) sheetRef.current?.querySelector<HTMLElement>('a[href]')?.focus()
  }, [open])

  async function handleLogout() {
    setOpen(false)
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <>
      <nav
        className="fixed inset-x-0 bottom-0 z-50 flex border-t border-[var(--border-strong)] bg-[var(--night)] px-1 pt-1 text-[var(--text-primary)] md:hidden"
        aria-label="Мобильная навигация"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {NAV.map(({ href, Icon, label }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`)
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={`relative mx-0.5 flex min-h-[52px] flex-1 flex-col items-center justify-center gap-1 rounded-[var(--radius-control)] border text-center transition-colors ${
                active
                  ? 'border-[var(--signal)] bg-[var(--signal)] text-[var(--on-signal)]'
                  : 'border-transparent text-[var(--text-quiet)] hover:border-[var(--border-strong)] hover:bg-[var(--field)] hover:text-[var(--text-primary)]'
              }`}
            >
              <Icon size={18} strokeWidth={1.8} aria-hidden />
              <span className="font-mono text-[9px] font-black uppercase tracking-[0.08em]">{label}</span>
            </Link>
          )
        })}

        <button
          ref={moreButtonRef}
          type="button"
          onClick={() => setOpen(value => !value)}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={SHEET_ID}
          className={`relative mx-0.5 flex min-h-[52px] flex-1 flex-col items-center justify-center gap-1 rounded-[var(--radius-control)] border text-center transition-colors ${
            moreActive || open
              ? 'border-[var(--signal)] bg-[var(--signal)] text-[var(--on-signal)]'
              : 'border-transparent text-[var(--text-quiet)] hover:border-[var(--border-strong)] hover:bg-[var(--field)] hover:text-[var(--text-primary)]'
          }`}
        >
          <MoreHorizontal size={18} strokeWidth={1.8} aria-hidden />
          <span className="font-mono text-[9px] font-black uppercase tracking-[0.08em]">Ещё</span>
        </button>
      </nav>

      <div
        className={`fixed inset-0 z-50 md:hidden transition-opacity duration-200 ${open ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'}`}
        aria-hidden={!open}
      >
        <button
          type="button"
          className="absolute inset-0 bg-bn-night/90"
          onClick={() => setOpen(false)}
          aria-label="Закрыть навигацию"
          tabIndex={open ? 0 : -1}
        />
        <div
          id={SHEET_ID}
          ref={sheetRef}
          role="dialog"
          aria-modal="true"
          aria-label="Дополнительная навигация"
          inert={!open}
          className={`absolute inset-x-0 bottom-0 border-t border-[var(--border-strong)] bg-[var(--field)] text-[var(--text-primary)] transition-transform duration-300 ${open ? 'translate-y-0' : 'translate-y-full'}`}
        >
          <div className="flex items-center justify-between border-b border-[var(--border-strong)] px-4 py-3">
            <span className="font-display text-xl font-black tracking-[-0.045em]">ЕЩЁ / BETTRACKER</span>
            <span className="h-2.5 w-2.5 rounded-control bg-[var(--signal)]" aria-hidden />
          </div>
          <div className="flex flex-col">
            {moreLinks.map(({ href, Icon, label }, index) => {
              const active = pathname === href || pathname.startsWith(`${href}/`)
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setOpen(false)}
                  aria-current={active ? 'page' : undefined}
                  className={`grid min-h-[52px] grid-cols-[30px_1fr_auto] items-center border-b border-[var(--border-subtle)] px-4 text-xs font-black uppercase tracking-[0.06em] ${
                    active
                      ? 'bg-[var(--signal)] text-[var(--on-signal)]'
                      : 'bg-[var(--field)] text-[var(--text-primary)] hover:bg-[var(--field-raised)]'
                  }`}
                >
                  <span className="font-mono text-[9px] opacity-60">{String(index + 5).padStart(2, '0')}</span>
                  {label}
                  <Icon size={15} strokeWidth={1.8} aria-hidden />
                </Link>
              )
            })}
            <button
              type="button"
              onClick={handleLogout}
              className="flex min-h-[52px] items-center justify-between bg-[var(--field)] px-4 text-xs font-black uppercase tracking-[0.06em] text-[var(--negative)]"
            >
              Выйти
              <LogOut size={15} strokeWidth={1.8} aria-hidden />
            </button>
          </div>
          <div style={{ paddingBottom: 'env(safe-area-inset-bottom)' }} />
        </div>
      </div>
    </>
  )
}
