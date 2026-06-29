'use client'

import Link from 'next/link'
import { trackClientEvent } from '@/lib/analytics/client'
import { EVENTS } from '@/lib/analytics/events'

export interface NextAction {
  type:   string
  icon:   string
  label:  string
  detail: string
  href:   string
}

export default function NextBestAction({ action }: { action: NextAction }) {
  return (
    <Link
      href={action.href}
      className="card border border-gray-700 hover:border-amber-700/50 flex items-center gap-4 group transition-colors"
      onClick={() =>
        trackClientEvent(EVENTS.NEXT_ACTION_CLICKED, { action_type: action.type })
      }
    >
      <span className="text-2xl shrink-0">{action.icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-0.5">
          Next best action
        </p>
        <p className="text-sm font-semibold text-white">{action.label}</p>
        <p className="text-xs text-slate-400 mt-0.5 truncate">{action.detail}</p>
      </div>
      <span className="text-slate-600 group-hover:text-amber-400 transition-colors text-base shrink-0">
        &rarr;
      </span>
    </Link>
  )
}
