import Link from 'next/link'
import type { PulseEvent } from '@/lib/events/pulse'
import { THEME_TOKENS } from '@/lib/events/pulse'

interface Props {
  event: PulseEvent
}

export default function EventPulseCard({ event }: Props) {
  const tokens = THEME_TOKENS[event.theme]
  const isTier1 = event.tier === 1

  // Tier 3 — slim banner only, no gradient card
  if (event.tier === 3) {
    return (
      <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg border border-night-700 bg-night-900">
        <span className="text-sm shrink-0">{event.icon}</span>
        <span className="text-xs text-slate-400">{event.label}</span>
        <span className="text-[10px] text-slate-700 shrink-0">· Event Pulse</span>
        {event.dashboardCta && (
          <Link
            href={event.dashboardCta.href}
            className="ml-auto text-xs text-amber-500 hover:text-amber-400 transition-colors shrink-0"
          >
            Scout →
          </Link>
        )}
      </div>
    )
  }

  // Tier 1 & 2 — themed gradient card
  return (
    <div
      className="relative overflow-hidden rounded-xl border"
      style={{ background: tokens.bg, borderColor: tokens.border }}
    >
      {/* Subtle texture (football = horizontal pitch lines, grass-tennis = diagonal) */}
      {tokens.texture && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ backgroundImage: tokens.texture }}
        />
      )}

      {/* Ambient glow — breathes on Tier 1, static on Tier 2 */}
      <div
        className={`absolute inset-0 pointer-events-none ${isTier1 ? 'animate-pulse-breathe' : ''}`}
        style={{ backgroundImage: tokens.glowBg }}
      />

      <div className="relative p-4 flex flex-col gap-3">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            <span className="text-xl shrink-0">{event.icon}</span>
            <div className="min-w-0">
              <p
                className="text-[10px] font-semibold uppercase tracking-widest mb-0.5"
                style={{ color: tokens.badgeText }}
              >
                Event Pulse{isTier1 ? ' · Global' : ' · Iconic'}
              </p>
              <h3 className="text-sm font-bold text-white leading-tight">{event.label}</h3>
              {event.sublabel && (
                <p className="text-[11px] text-slate-500 mt-0.5">{event.sublabel}</p>
              )}
            </div>
          </div>

          {/* Live chip */}
          <span
            className="flex items-center gap-1.5 text-[10px] font-semibold rounded-full px-2.5 py-1 shrink-0 uppercase tracking-wide"
            style={{ background: tokens.badgeBg, color: tokens.badgeText }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full animate-pulse"
              style={{ background: tokens.badgeText }}
            />
            Live
          </span>
        </div>

        {/* CTAs */}
        <div className="flex items-center gap-3">
          {event.dashboardCta && (
            <Link
              href={event.dashboardCta.href}
              className="text-xs font-medium rounded-lg px-3 py-1.5 border transition-colors hover:opacity-80"
              style={{
                borderColor: tokens.border,
                color:       tokens.badgeText,
                background:  tokens.badgeBg,
              }}
            >
              {event.dashboardCta.label} →
            </Link>
          )}
          <Link
            href="/decisions?filter=all"
            className="text-xs text-slate-600 hover:text-slate-400 transition-colors"
          >
            View decisions →
          </Link>
        </div>
      </div>
    </div>
  )
}
