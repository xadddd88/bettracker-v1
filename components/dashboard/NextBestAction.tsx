'use client'

import Link from 'next/link'
import { trackClientEvent } from '@/lib/analytics/client'
import { EVENTS } from '@/lib/analytics/events'

export interface NextAction {
  type:   string
  label:  string
  detail: string
  href:   string
  meta:   string
}

export default function NextBestAction({ action }: { action: NextAction }) {
  return (
    <Link
      href={action.href}
      className="group flex min-h-64 flex-col rounded-control border border-bn-signal bg-bn-field p-5 transition-colors hover:bg-bn-raised sm:p-7"
      onClick={() =>
        trackClientEvent(EVENTS.NEXT_ACTION_CLICKED, { action_type: action.type })
      }
    >
      <div className="flex items-center justify-between gap-4">
        <p className="font-mono text-[11px] font-black uppercase tracking-[0.12em] text-bn-signal">
          Adaptive action
        </p>
        <span className="font-mono text-[11px] font-bold uppercase tracking-[0.1em] text-bn-muted">{action.meta}</span>
      </div>
      <div className="my-auto py-8">
        <p className="font-display text-3xl font-black leading-tight tracking-[-0.04em] text-bn-text">{action.label}</p>
        <p className="mt-3 text-sm leading-6 text-bn-muted">{action.detail}</p>
      </div>
      <span className="inline-flex min-h-11 items-center justify-between rounded-control bg-bn-signal px-4 text-xs font-black uppercase tracking-[0.08em] text-bn-on-signal">
        Continue <span aria-hidden="true" className="text-lg transition-transform group-hover:translate-x-1">→</span>
      </span>
    </Link>
  )
}
