'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { LucideIcon } from 'lucide-react'
import {
  Bot,
  Brain,
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
  { href: '/dashboard', Icon: LayoutDashboard, label: 'Home' },
  { href: '/ai', Icon: Bot, label: 'Scan' },
  { href: '/bets', Icon: Target, label: 'Tracker' },
  { href: '/analytics', Icon: TrendingUp, label: 'Stats' },
]

const MORE_LINKS: { href: string; Icon: LucideIcon; label: string }[] = [
  { href: '/decisions', Icon: ClipboardList, label: 'Decisions' },
  { href: '/scout', Icon: Search, label: 'Scout' },
  { href: '/coach', Icon: Brain, label: 'Coach' },
  { href: '/bankroll', Icon: Wallet, label: 'Bankroll' },
  { href: '/settings', Icon: Settings, label: 'Settings' },
]

const MORE_ROUTES = MORE_LINKS.map(link => link.href)
const SHEET_ID = 'mobile-nav-more-sheet'

export default function MobileNav() {
  const pathname = usePathname()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const sheetRef = useRef<HTMLDivElement>(null)
  const moreButtonRef = useRef<HTMLButtonElement>(null)
  const moreActive = MORE_ROUTES.some(route => pathname === route || pathname.startsWith(`${route}/`))

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
        className="editorial-dark fixed inset-x-0 bottom-0 z-50 flex border-t border-white/30 bg-[#050505] text-white md:hidden"
        aria-label="Mobile navigation"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {NAV.map(({ href, Icon, label }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`)
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={`relative flex min-h-[58px] flex-1 flex-col items-center justify-center gap-1 text-center transition-colors ${
                active ? 'text-[#e8ff00]' : 'text-white/45 hover:text-white'
              }`}
            >
              <span className={`absolute inset-x-2 top-0 h-[3px] transition-transform duration-300 ${active ? 'scale-x-100 bg-[#e8ff00]' : 'scale-x-0 bg-white'}`} />
              <Icon size={18} strokeWidth={1.8} aria-hidden />
              <span className="font-mono text-[8px] font-bold uppercase tracking-[0.12em]">{label}</span>
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
          className={`relative flex min-h-[58px] flex-1 flex-col items-center justify-center gap-1 text-center transition-colors ${
            moreActive || open ? 'text-[#e8ff00]' : 'text-white/45 hover:text-white'
          }`}
        >
          <span className={`absolute inset-x-2 top-0 h-[3px] transition-transform duration-300 ${moreActive || open ? 'scale-x-100 bg-[#e8ff00]' : 'scale-x-0 bg-white'}`} />
          <MoreHorizontal size={18} strokeWidth={1.8} aria-hidden />
          <span className="font-mono text-[8px] font-bold uppercase tracking-[0.12em]">More</span>
        </button>
      </nav>

      <div
        className={`fixed inset-0 z-50 md:hidden transition-opacity duration-200 ${open ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'}`}
        aria-hidden={!open}
      >
        <button
          type="button"
          className="absolute inset-0 bg-black/65"
          onClick={() => setOpen(false)}
          aria-label="Close navigation"
          tabIndex={open ? 0 : -1}
        />
        <div
          id={SHEET_ID}
          ref={sheetRef}
          role="dialog"
          aria-modal="true"
          aria-label="More navigation"
          inert={!open}
          className={`absolute inset-x-0 bottom-0 border-t border-black bg-[#f5f5f0] transition-transform duration-300 ${open ? 'translate-y-0' : 'translate-y-full'}`}
        >
          <div className="flex items-center justify-between border-b border-black px-4 py-3">
            <span className="font-display text-xl font-black tracking-[-0.05em]">MORE / XADDD</span>
            <span className="h-3 w-3 bg-[#e8ff00] ring-1 ring-black" aria-hidden />
          </div>
          <div className="flex flex-col">
            {MORE_LINKS.map(({ href, Icon, label }, index) => {
              const active = pathname === href || pathname.startsWith(`${href}/`)
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setOpen(false)}
                  aria-current={active ? 'page' : undefined}
                  className={`grid min-h-[54px] grid-cols-[30px_1fr_auto] items-center border-b border-black px-4 text-xs font-black uppercase tracking-[0.08em] ${active ? 'bg-[#e8ff00]' : 'bg-white'}`}
                >
                  <span className="font-mono text-[9px] text-black/45">{String(index + 5).padStart(2, '0')}</span>
                  {label}
                  <Icon size={15} strokeWidth={1.8} aria-hidden />
                </Link>
              )
            })}
            <button
              type="button"
              onClick={handleLogout}
              className="editorial-dark flex min-h-[54px] items-center justify-between bg-[#050505] px-4 text-xs font-black uppercase tracking-[0.08em] text-white"
            >
              Sign out
              <LogOut size={15} strokeWidth={1.8} aria-hidden />
            </button>
          </div>
          <div style={{ paddingBottom: 'env(safe-area-inset-bottom)' }} />
        </div>
      </div>
    </>
  )
}
