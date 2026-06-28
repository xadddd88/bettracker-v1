'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'

const NAV = [
  { href: '/dashboard',  icon: '📊', label: 'Dashboard' },
  { href: '/ai',         icon: '🤖', label: 'AI Agents' },
  { href: '/scout',      icon: '🔍', label: 'Scout' },
  { href: '/bets',       icon: '🎯', label: 'Bets' },
  { href: '/analytics',  icon: '📈', label: 'Analytics' },
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
    <aside className="w-[220px] flex-shrink-0 flex flex-col border-r border-gray-800 bg-gray-900">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-gray-800">
        <div className="text-lg font-bold text-white">BetTracker</div>
        <div className="text-xs text-gray-500 mt-0.5">v1.0 · Sprint 1</div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 flex flex-col gap-1">
        {NAV.map(({ href, icon, label }) => {
          const active = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                active
                  ? 'bg-indigo-600/20 text-indigo-400'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800'
              }`}
            >
              <span className="text-base">{icon}</span>
              {label}
            </Link>
          )
        })}
      </nav>

      {/* User */}
      <div className="px-3 py-4 border-t border-gray-800">
        <div className="px-3 py-2 mb-1">
          <div className="text-xs text-gray-500 truncate">{user.email}</div>
        </div>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
        >
          <span>🚪</span> Sign out
        </button>
      </div>
    </aside>
  )
}
