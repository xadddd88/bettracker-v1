'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV = [
  { href: '/dashboard', icon: '📊', label: 'Home' },
  { href: '/ai',        icon: '🤖', label: 'AI' },
  { href: '/scout',     icon: '🔍', label: 'Scout' },
  { href: '/bets',      icon: '🎯', label: 'Bets' },
  { href: '/analytics', icon: '📈', label: 'Stats' },
]

export default function MobileNav() {
  const pathname = usePathname()

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-night-900 border-t border-night-700 flex md:hidden">
      {NAV.map(({ href, icon, label }) => {
        const active = pathname === href || pathname.startsWith(href + '/')
        return (
          <Link
            key={href}
            href={href}
            className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-center transition-colors ${
              active ? 'text-amber-400' : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            <span className="text-lg leading-none">{icon}</span>
            <span className="text-[10px] font-medium">{label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
