'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'
import FeedbackWidget from '@/components/feedback/FeedbackWidget'

const NAV = [
  { href: '/dashboard',  icon: '📊', label: 'Dashboard' },
  { href: '/ai',         icon: '🤖', label: 'AI Analyst' },
  { href: '/decisions',  icon: '📋', label: 'Decisions' },
  { href: '/scout',      icon: '🔍', label: 'Scout' },
  { href: '/bets',       icon: '🎯', label: 'Bets' },
  { href: '/analytics',  icon: '📈', label: 'Analytics' },
  { href: '/coach',      icon: '🧠', label: 'Coach' },
  { href: '/bankroll',   icon: '💰', label: 'Bankroll' },
  { href: '/settings',   icon: '⚙️',  label: 'Settings' },
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
    <aside className="w-[220px] flex-shrink-0 flex flex-col border-r border-night-700 bg-night-900">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-night-700">
        <div className="text-lg font-bold text-white font-display">BetTracker</div>
        <div className="text-xs text-amber-500/70 mt-0.5 font-mono tracking-wide">AI</div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 flex flex-col gap-0.5">
        {NAV.map(({ href, icon, label }) => {
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
              <span className="text-base">{icon}</span>
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
        <FeedbackWidget />
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-night-800 transition-colors"
        >
          <span>🚪</span> Sign out
        </button>
      </div>
    </aside>
  )
}
