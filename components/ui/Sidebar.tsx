'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'
import type { LucideIcon } from 'lucide-react'
import {
  Bot,
  Brain,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Search,
  Settings,
  Target,
  TrendingUp,
  Wallet,
} from 'lucide-react'

const PRIMARY_NAV: { href: string; Icon: LucideIcon; index: string; label: string }[] = [
  { href: '/dashboard', Icon: LayoutDashboard, index: '01', label: 'Home' },
  { href: '/ai', Icon: Bot, index: '02', label: 'Scan' },
  { href: '/bets', Icon: Target, index: '03', label: 'Tracker' },
  { href: '/analytics', Icon: TrendingUp, index: '04', label: 'Stats' },
]

const SECONDARY_NAV: { href: string; Icon: LucideIcon; label: string }[] = [
  { href: '/decisions', Icon: ClipboardList, label: 'Decisions' },
  { href: '/scout', Icon: Search, label: 'Scout' },
  { href: '/coach', Icon: Brain, label: 'Coach' },
  { href: '/bankroll', Icon: Wallet, label: 'Bankroll' },
  { href: '/settings', Icon: Settings, label: 'Settings' },
]

export default function Sidebar({ user }: { user: User }) {
  const pathname = usePathname()
  const router = useRouter()

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <aside className="editorial-dark flex w-[244px] shrink-0 flex-col border-r border-black bg-[#050505] text-white">
      <div className="flex min-h-20 items-center border-b border-white/30 px-5">
        <div className="min-w-0 flex-1">
          <div className="font-display text-xl font-black tracking-[-0.06em]">XADDD</div>
          <div className="mt-1 font-mono text-[8px] font-bold tracking-[0.2em] text-white/55">
            FOUNDER SYSTEM / 2026
          </div>
        </div>
        <div className="h-3 w-3 bg-[#e8ff00]" aria-hidden />
      </div>

      <div className="border-b border-white/30 px-5 py-4">
        <div className="font-mono text-[9px] font-bold tracking-[0.18em] text-white/50">DECIDE / VERIFY / TRACK</div>
      </div>

      <nav className="flex-1 overflow-y-auto" aria-label="Primary navigation">
        <div className="border-b border-white/30">
          {PRIMARY_NAV.map(({ href, Icon, index, label }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`)
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? 'page' : undefined}
                className={`group grid min-h-[58px] grid-cols-[28px_1fr_auto] items-center gap-2 border-t border-white/20 px-5 transition-all duration-200 first:border-t-0 ${
                  active
                    ? 'bg-[#e8ff00] text-black'
                    : 'text-white hover:bg-white hover:text-black'
                }`}
              >
                <span className="font-mono text-[9px] font-bold opacity-55">{index}</span>
                <span className="text-sm font-black uppercase tracking-[0.06em]">{label}</span>
                <Icon size={16} strokeWidth={1.8} aria-hidden />
              </Link>
            )
          })}
        </div>

        <div className="px-5 pb-5 pt-6">
          <div className="mb-3 font-mono text-[8px] font-bold tracking-[0.2em] text-white/40">ARCHIVE / TOOLS</div>
          <div className="flex flex-col">
            {SECONDARY_NAV.map(({ href, Icon, label }) => {
              const active = pathname === href || pathname.startsWith(`${href}/`)
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? 'page' : undefined}
                  className={`flex min-h-11 items-center gap-3 border-b border-white/15 text-xs font-bold uppercase tracking-[0.08em] transition-colors ${
                    active ? 'text-[#e8ff00]' : 'text-white/60 hover:text-white'
                  }`}
                >
                  <Icon size={14} strokeWidth={1.8} aria-hidden />
                  {label}
                </Link>
              )
            })}
          </div>
        </div>
      </nav>

      <div className="border-t border-white/30 p-5">
        <div className="truncate font-mono text-[9px] text-white/45">{user.email}</div>
        <button
          type="button"
          onClick={handleLogout}
          className="mt-4 flex min-h-11 w-full items-center justify-between border border-white px-3 text-[10px] font-black uppercase tracking-[0.12em] transition-colors hover:bg-white hover:text-black"
        >
          Sign out
          <LogOut size={14} strokeWidth={1.8} aria-hidden />
        </button>
      </div>
    </aside>
  )
}
