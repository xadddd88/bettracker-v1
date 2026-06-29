'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'
import type { LucideIcon } from 'lucide-react'
import {
  LayoutDashboard,
  Bot,
  ClipboardList,
  Search,
  Target,
  TrendingUp,
  Brain,
  Wallet,
  Settings,
  LogOut,
} from 'lucide-react'

const NAV: { href: string; Icon: LucideIcon; label: string }[] = [
  { href: '/dashboard',  Icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/ai',         Icon: Bot,             label: 'AI Analyst' },
  { href: '/decisions',  Icon: ClipboardList,   label: 'Decisions' },
  { href: '/scout',      Icon: Search,          label: 'Scout' },
  { href: '/bets',       Icon: Target,          label: 'Bets' },
  { href: '/analytics',  Icon: TrendingUp,      label: 'Analytics' },
  { href: '/coach',      Icon: Brain,           label: 'Coach' },
  { href: '/bankroll',   Icon: Wallet,          label: 'Bankroll' },
  { href: '/settings',   Icon: Settings,        label: 'Settings' },
]

export default function Sidebar({ user }: { user: User }) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <aside className="w-[220px] flex-shrink-0 flex flex-col border-r border-night-700" style={{ background: 'var(--surface-1)' }}>
      {/* Logo */}
      <div className="px-5 py-5 border-b border-night-700">
        <div className="text-lg font-bold text-white font-display">BetTracker</div>
        <div className="text-xs text-amber-500/70 mt-0.5 font-mono tracking-wide">AI</div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 flex flex-col gap-0.5">
        {NAV.map(({ href, Icon, label }) => {
          const active = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                active
                  ? 'bg-amber-500/10 text-amber-400'
                  : 'text-slate-400 hover:text-white hover:bg-night-800'
              }`}
            >
              <Icon size={16} strokeWidth={1.75} className="shrink-0" />
              {label}
            </Link>
          )
        })}
      </nav>

      {/* User */}
      <div className="px-3 py-4 border-t border-night-700">
        <div className="px-3 py-2 mb-1">
          <div className="text-xs text-slate-500 truncate">{user.email}</div>
        </div>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-night-800 transition-colors"
        >
          <LogOut size={16} strokeWidth={1.75} className="shrink-0" />
          Sign out
        </button>
      </div>
    </aside>
  )
}
