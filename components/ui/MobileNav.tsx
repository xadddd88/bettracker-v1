'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { LucideIcon } from 'lucide-react'
import { LayoutDashboard, Bot, Search, Target, TrendingUp } from 'lucide-react'

const NAV: { href: string; Icon: LucideIcon; label: string }[] = [
  { href: '/dashboard', Icon: LayoutDashboard, label: 'Home' },
  { href: '/ai',        Icon: Bot,             label: 'AI' },
  { href: '/scout',     Icon: Search,          label: 'Scout' },
  { href: '/bets',      Icon: Target,          label: 'Bets' },
  { href: '/analytics', Icon: TrendingUp,      label: 'Stats' },
]

export default function MobileNav() {
  const pathname = usePathname()

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-night-700 flex md:hidden" style={{ background: 'var(--surface-1)' }}>
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
    </nav>
  )
}
