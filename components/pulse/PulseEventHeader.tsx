import type { PulseEvent } from '@/lib/events/pulse'

interface Props {
  event: PulseEvent
}

const TIER_LABEL: Record<1 | 2 | 3, string> = {
  1: 'Global Pulse',
  2: 'Iconic Pulse',
  3: 'Active now',
}

export default function PulseEventHeader({ event }: Props) {
  return (
    <div
      className="relative overflow-hidden rounded-xl mb-6"
      style={{
        background: 'linear-gradient(135deg, rgba(255,255,255,0.045) 0%, rgba(255,255,255,0.015) 100%)',
        border: '1px solid color-mix(in srgb, var(--accent) 22%, transparent)',
        boxShadow: '0 0 48px var(--accent-glow), inset 0 1px 0 rgba(255,255,255,0.07)',
      }}
    >
      {/* Accent top edge — gradient line */}
      <div
        className="absolute inset-x-0 top-0 h-px pointer-events-none"
        style={{ background: 'linear-gradient(90deg, transparent 0%, var(--accent-soft) 40%, var(--accent-soft) 60%, transparent 100%)' }}
      />

      <div className="relative px-4 py-3 flex items-center gap-3">
        {/* Icon in accent-tinted box */}
        <div
          className="flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center text-lg"
          style={{
            background: 'var(--accent-soft)',
            border: '1px solid color-mix(in srgb, var(--accent) 18%, transparent)',
          }}
        >
          {event.icon}
        </div>

        {/* Event info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[13px] font-semibold text-white leading-none">
              {event.label}
            </span>
            <span
              className="text-[9px] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-widest leading-none"
              style={{
                background: 'var(--accent-soft)',
                color: 'var(--accent)',
                border: '1px solid color-mix(in srgb, var(--accent) 18%, transparent)',
              }}
            >
              {TIER_LABEL[event.tier]}
            </span>
          </div>
          {event.sublabel && (
            <p className="text-[11px] text-slate-500 mt-1 leading-none">{event.sublabel}</p>
          )}
        </div>

        {/* Live indicator */}
        <div className="flex items-center gap-1.5 flex-shrink-0 ml-auto">
          <div
            className="w-1.5 h-1.5 rounded-full animate-pulse-breathe"
            style={{ background: 'var(--accent)', boxShadow: '0 0 5px var(--accent)' }}
          />
          <span className="text-[10px] text-slate-500 font-medium tracking-wide">Active</span>
        </div>
      </div>
    </div>
  )
}
