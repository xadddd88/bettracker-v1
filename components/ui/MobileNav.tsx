'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { LucideIcon } from 'lucide-react'
import {
  LayoutDashboard,
  Bot,
  Search,
  Target,
  TrendingUp,
  MoreHorizontal,
  ClipboardList,
  Brain,
  Wallet,
  Settings,
  LogOut,
} from 'lucide-react'

const NAV: { href: string; Icon: LucideIcon; label: string }[] = [
  { href: '/dashboard', Icon: LayoutDashboard, label: 'Home' },
  { href: '/ai',        Icon: Bot,             label: 'AI' },
  { href: '/scout',     Icon: Search,          label: 'Scout' },
  { href: '/bets',      Icon: Target,          label: 'Bets' },
  { href: '/analytics', Icon: TrendingUp,      label: 'Stats' },
]

const MORE_LINKS: { href: string; Icon: LucideIcon; label: string }[] = [
  { href: '/decisions', Icon: ClipboardList, label: 'Decisions' },
  { href: '/coach',     Icon: Brain,         label: 'Coach' },
  { href: '/bankroll',  Icon: Wallet,        label: 'Bankroll' },
  { href: '/settings',  Icon: Settings,      label: 'Settings' },
]

const MORE_ROUTES = MORE_LINKS.map(l => l.href)
const SHEET_ID = 'mobile-nav-more-sheet'

export default function MobileNav() {
  const pathname = usePathname()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const sheetRef = useRef<HTMLDivElement>(null)
  const moreButtonRef = useRef<HTMLButtonElement>(null)

  const moreActive = MORE_ROUTES.some(r => pathname === r || pathname.startsWith(r + '/'))

  // Close the sheet whenever the route changes.
  useEffect(() => {
    setOpen(false)
  }, [pathname])

  // Escape closes the sheet; Tab is trapped inside it while open.
  useEffect(() => {
    if (!open) return

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false)
        moreButtonRef.current?.focus()
        return
      }
      if (e.key === 'Tab') {
        const focusables = sheetRef.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled])')
        if (!focusables || focusables.length === 0) return
        const list = Array.from(focusables)
        const first = list[0]
        const last = list[list.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open])

  // Move focus into the sheet when it opens.
  useEffect(() => {
    if (open) {
      sheetRef.current?.querySelector<HTMLElement>('a[href]')?.focus()
    }
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
        className="fixed bottom-0 left-0 right-0 z-50 border-t border-night-700 flex md:hidden"
        style={{ background: 'var(--surface-1)' }}
      >
        {NAV.map(({ href, Icon, label }) => {
          const active = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-center transition-colors ${
                active ? 'text-amber-400' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              <Icon size={20} strokeWidth={1.75} />
              <span className="text-[10px] font-medium">{label}</span>
            </Link>
          )
        })}
        <button
          ref={moreButtonRef}
          type="button"
          onClick={() => setOpen(o => !o)}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={SHEET_ID}
          className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-center transition-colors ${
            moreActive ? 'text-amber-400' : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          <MoreHorizontal size={20} strokeWidth={1.75} />
          <span className="text-[10px] font-medium">More</span>
        </button>
      </nav>

      {/* Backdrop + bottom sheet for the routes that don't fit in the tab bar */}
      <div
        className={`fixed inset-0 z-50 md:hidden transition-opacity duration-200 ${
          open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        aria-hidden={!open}
      >
        <div
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        />

        <div
          id={SHEET_ID}
          ref={sheetRef}
          role="dialog"
          aria-modal="true"
          aria-label="More navigation"
          inert={!open}
          className={`absolute bottom-0 left-0 right-0 border-t rounded-t-2xl transition-transform duration-200 ${
            open ? 'translate-y-0' : 'translate-y-full'
          }`}
          style={{ background: 'var(--surface-1)', borderColor: 'var(--border)' }}
        >
          <div className="flex flex-col py-2">
            {MORE_LINKS.map(({ href, Icon, label }) => {
              const active = pathname === href || pathname.startsWith(href + '/')
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setOpen(false)}
                  className={`flex items-center gap-3 px-5 py-3 text-sm font-medium transition-colors ${
                    active ? 'text-amber-400' : 'text-slate-300 hover:text-white'
                  }`}
                >
                  <Icon size={18} strokeWidth={1.75} className="shrink-0" />
                  {label}
                </Link>
              )
            })}

            <div className="my-1 border-t border-night-700" />

            <button
              type="button"
              onClick={handleLogout}
              className="flex items-center gap-3 px-5 py-3 text-sm font-medium text-slate-300 hover:text-white transition-colors"
            >
              <LogOut size={18} strokeWidth={1.75} className="shrink-0" />
              Sign out
            </button>
          </div>

          <div style={{ paddingBottom: 'env(safe-area-inset-bottom)' }} />
        </div>
      </div>
    </>
  )
}
