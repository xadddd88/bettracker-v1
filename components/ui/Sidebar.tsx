'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'
import type { LucideIcon } from 'lucide-react'
import type { PulseEvent } from '@/lib/events/pulse'
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

interface SidebarProps {
  user: User
  primaryEvent?: PulseEvent | null
}

export default function Sidebar({ user, primaryEvent }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <aside
      className="relative w-[220px] flex-shrink-0 flex flex-col border-r"
      style={{ background: 'var(--surface-1)', borderColor: 'var(--border)' }}
    >
      {/* Logo */}
      <div className="px-5 py-5 border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="text-lg font-bold text-white font-display">BetTracker</div>
        <div
          className="text-xs mt-0.5 font-mono tracking-wide"
          style={{ color: 'var(--accent)' }}
        >
          AI
        </div>
      </div>

      {/* Premium event chip — shown when a Pulse event is active */}
      {primaryEvent && (
        <div className="px-3 py-2.5 border-b" style={{ borderColor: 'var(--border)' }}>
          <div
            className="relative rounded-lg px-3 py-2.5 overflow-hidden"
            style={{
              background: 'var(--accent-soft)',
              border: '1px solid color-mix(in srgb, var(--accent) 20%, transparent)',
              boxShadow: '0 0 16px var(--accent-glow)',
            }}
          >
            {/* Accent top edge */}
            <div
              className="absolute inset-x-0 top-0 h-px"
              style={{ background: 'linear-gradient(90deg, transparent, var(--accent-soft), transparent)' }}
            />
            <div className="flex items-center gap-2">
              <span className="text-base leading-none flex-shrink-0">{primaryEvent.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="text-[11px] font-semibold text-white truncate leading-tight">
                  {primaryEvent.label}
                </div>
                {primaryEvent.sublabel && (
                  <div
                    className="text-[10px] mt-0.5 truncate leading-none"
                    style={{ color: 'var(--accent)', opacity: 0.75 }}
                  >
                    {primaryEvent.sublabel}
                  </div>
                )}
              </div>
              <div
                className="w-1.5 h-1.5 rounded-full flex-shrink-0 animate-pulse-breathe"
                style={{ background: 'var(--accent)' }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 flex flex-col gap-0.5">
        {NAV.map(({ href, Icon, label }) => {
          const active = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
              style={
                active
                  ? {
                      background: 'var(--accent-soft)',
                      color: 'var(--accent)',
                      boxShadow: 'inset 2px 0 0 var(--accent-rail)',
                    }
                  : undefined
              }
            >
              <Icon
                size={16}
                strokeWidth={1.75}
                className={`shrink-0 ${active ? '' : 'text-slate-400'}`}
              />
              <span className={active ? '' : 'text-slate-400 hover:text-white'}>
                {label}
              </span>
            </Link>
          )
        })}
      </nav>

      {/* User */}
      <div className="px-3 py-4 border-t" style={{ borderColor: 'var(--border)' }}>
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

      {/* Ambient glow — bleeds up from bottom */}
      <div
        className="absolute bottom-0 left-0 right-0 pointer-events-none"
        style={{
          height: '140px',
          background: 'linear-gradient(to top, var(--accent-glow), transparent)',
          transition: 'background 0.6s ease',
        }}
      />
    </aside>
  )
}
