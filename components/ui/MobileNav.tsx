'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { LucideIcon } from 'lucide-react'
import {
  ClipboardList,
  LayoutDashboard,
  Search,
  TrendingUp,
  Wallet,
} from 'lucide-react'

type NavItem = { href: string; Icon: LucideIcon; label: string; aliases?: string[] }

const NAV: NavItem[] = [
  { href: '/dashboard', Icon: LayoutDashboard, label: 'Главная' },
  { href: '/scout', Icon: Search, label: 'Исследование', aliases: ['/ai'] },
  { href: '/decisions', Icon: ClipboardList, label: 'Журнал', aliases: ['/bets'] },
  { href: '/analytics', Icon: TrendingUp, label: 'Аналитика', aliases: ['/coach'] },
  { href: '/bankroll', Icon: Wallet, label: 'Риск' },
]

function isActive(pathname: string, item: NavItem): boolean {
  return [item.href, ...(item.aliases ?? [])].some((route) => pathname === route || pathname.startsWith(`${route}/`))
}

export default function MobileNav() {
  const pathname = usePathname()

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-50 flex border-t border-[var(--border-strong)] bg-[var(--night)] px-1 pt-1 text-[var(--text-primary)] md:hidden"
      aria-label="Мобильная навигация"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {NAV.map((item) => {
        const { href, Icon, label } = item
        const active = isActive(pathname, item)
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
            <span className="max-w-full px-0.5 text-center font-mono text-[9px] font-black uppercase leading-tight tracking-[0.01em]">{label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
