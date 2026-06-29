'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { trackClientEvent } from '@/lib/analytics/client'
import { EVENTS } from '@/lib/analytics/events'
import { bucketScoutScore } from '@/lib/analytics/buckets'
import type { MarketOpportunity, OpportunityStatus } from '@/types'
import { Search, Eye, X, Loader2, AlertTriangle } from 'lucide-react'

type Sport     = 'soccer' | 'tennis' | 'cs2' | 'basketball' | 'ice_hockey' | 'mma' | 'other'
type Locale    = 'auto' | 'uk' | 'ru' | 'en' | 'es' | 'fr' | 'de' | 'ar'
type Timeframe = 'today' | 'tomorrow' | 'this_week'

const SPORTS: { value: Sport; label: string }[] = [
  { value: 'soccer',     label: 'Football'   },
  { value: 'tennis',     label: 'Tennis'     },
  { value: 'cs2',        label: 'CS2'        },
  { value: 'basketball', label: 'Basketball' },
  { value: 'ice_hockey', label: 'Hockey'     },
  { value: 'mma',        label: 'MMA'        },
  { value: 'other',      label: 'Other'      },
]

const SPORT_ABBR: Record<Sport, string> = {
  soccer:     'SOCC',
  tennis:     'TEN',
  cs2:        'CS2',
  basketball: 'BASK',
  ice_hockey: 'HOC',
  mma:        'MMA',
  other:      'OTH',
}

const LOCALES: { value: Locale; label: string }[] = [
  { value: 'auto', label: 'Auto (detect)' },
  { value: 'en',   label: 'English' },
  { value: 'uk',   label: 'Українська' },
  { value: 'ru',   label: 'Русский' },
  { value: 'es',   label: 'Español' },
  { value: 'fr',   label: 'Français' },
  { value: 'de',   label: 'Deutsch' },
  { value: 'ar',   label: 'العربية' },
]

const TIMEFRAMES: { value: Timeframe; label: string }[] = [
  { value: 'today',     label: 'Today' },
  { value: 'tomorrow',  label: 'Tomorrow' },
  { value: 'this_week', label: 'This week' },
]

const TYPE_STYLE: Record<string, string> = {
  value:      'text-green-400',
  contrarian: 'text-blue-400',
  pattern:    'text-purple-400',
  general:    'text-gray-400',
}

const STATUS_BADGE: Record<OpportunityStatus, { label: string; style: string } | null> = {
  discovered:            null,
  research_needed:       { label: 'In Analysis', style: 'text-yellow-400 bg-yellow-950/40 border-yellow-800' },
  watchlisted:           { label: 'Watching',    style: 'text-blue-400 bg-blue-950/40 border-blue-800' },
  converted_to_decision: { label: 'Converted',   style: 'text-green-400 bg-green-950/40 border-green-800' },
  dismissed:             null,
  expired:               null,
}

function scoreStyle(score: number): string {
  if (score >= 70) return 'text-green-400 bg-green-950/40 border-green-800'
  if (score >= 40) return 'text-yellow-400 bg-yellow-950/40 border-yellow-800'
  return 'text-gray-400 bg-gray-800/40 border-gray-700'
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
function fmtMatchDate(d: string): string {
  const parts = d.split('-')
  return `${parseInt(parts[2])} ${MONTHS[parseInt(parts[1]) - 1]}`
}

// ─── Opportunity card ─────────────────────────────────────────
interface CardProps {
  opp:        MarketOpportunity
  expanded:   boolean
  actionBusy: boolean
  onToggle:   () => void
  onAnalyse:  () => void
  onWatch:    () => void
  onDismiss:  () => void
}

function OpportunityCard({ opp, expanded, actionBusy, onToggle, onAnalyse, onWatch, onDismiss }: CardProps) {
  const sportAbbr = SPORT_ABBR[opp.sport_code as Sport] ?? 'OTH'
  const typeColor = TYPE_STYLE[opp.opportunity_type] ?? 'text-gray-400'
  const statusBadge = STATUS_BADGE[opp.status]
  const score = opp.scout_score ?? 0
  const REASONING_LIMIT = 140

  return (
    <div className="card flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] font-mono font-bold text-slate-500 bg-night-800 border border-night-700 px-1.5 py-0.5 rounded">{sportAbbr}</span>
            <span className="text-sm font-semibold text-white truncate">{opp.event_name}</span>
          </div>
          <div className="text-xs text-gray-400 mt-0.5">
            {opp.market_type}{opp.selection ? ` · ${opp.selection}` : ''}
          </div>
        </div>
        {statusBadge && (
          <span className={`text-[10px] font-medium border rounded-full px-2 py-0.5 shrink-0 ${statusBadge.style}`}>
            {statusBadge.label}
          </span>
        )}
      </div>

      {/* Tags row */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`text-[11px] font-semibold uppercase tracking-wide ${typeColor}`}>
          {opp.opportunity_type}
        </span>
        <span className="text-gray-700">·</span>
        <span className={`text-[11px] font-medium border rounded-full px-2 py-0.5 ${scoreStyle(score)}`}>
          Score {score}
        </span>
        {opp.risk_level && (
          <>
            <span className="text-gray-700">·</span>
            <span className={`text-[11px] font-medium ${
              opp.risk_level === 'low' ? 'text-green-500' :
              opp.risk_level === 'medium' ? 'text-yellow-500' : 'text-red-500'
            }`}>
              {opp.risk_level.charAt(0).toUpperCase() + opp.risk_level.slice(1)} risk
            </span>
          </>
        )}
        {opp.model_probability != null && (
          <>
            <span className="text-gray-700">·</span>
            <span className="text-[11px] text-gray-500">
              Model {opp.model_probability.toFixed(1)}%
            </span>
          </>
        )}
        {opp.match_date && (
          <>
            <span className="text-gray-700">·</span>
            <span className="text-[11px] text-gray-500">
              {fmtMatchDate(opp.match_date)}
            </span>
          </>
        )}
      </div>

      {/* Reasoning */}
      <div>
        <p className="text-sm text-gray-300 leading-relaxed">
          {expanded || opp.reasoning.length <= REASONING_LIMIT
            ? opp.reasoning
            : `${opp.reasoning.slice(0, REASONING_LIMIT)}…`}
        </p>
        {opp.reasoning.length > REASONING_LIMIT && (
          <button
            onClick={onToggle}
            className="text-xs text-indigo-400 hover:text-indigo-300 mt-1 transition-colors"
          >
            {expanded ? 'Show less' : 'Show more'}
          </button>
        )}
      </div>

      {/* Required checks */}
      {opp.required_checks && opp.required_checks.length > 0 && (
        <div>
          <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wide mb-1">
            Required checks
          </p>
          <ul className="flex flex-col gap-0.5">
            {opp.required_checks.map((check, i) => (
              <li key={i} className="text-xs text-gray-400 flex items-start gap-1.5">
                <span className="text-gray-600 mt-0.5 shrink-0">•</span>
                {check}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Actions */}
      {opp.status !== 'converted_to_decision' && (
        <div className="flex gap-2 pt-1 border-t border-gray-800">
          <button
            className="btn-primary flex-1 text-sm py-1.5 flex items-center justify-center gap-1.5"
            onClick={onAnalyse}
            disabled={actionBusy}
          >
            <Search size={13} strokeWidth={2} />
            Analyse
          </button>
          <button
            className="flex-1 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-blue-400 text-sm font-medium border border-gray-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
            onClick={onWatch}
            disabled={actionBusy || opp.status === 'watchlisted'}
          >
            <Eye size={13} strokeWidth={2} />
            {opp.status === 'watchlisted' ? 'Watching' : 'Watchlist'}
          </button>
          <button
            className="px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-500 text-sm border border-gray-700 transition-colors disabled:opacity-50"
            onClick={onDismiss}
            disabled={actionBusy}
            title="Dismiss"
          >
            <X size={13} strokeWidth={2} />
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Main ScoutForm ───────────────────────────────────────────
interface PulsePreset {
  id: string
  label: string
  icon: string
  sport: string
  context: string
  tier: 1 | 2 | 3
}

interface ScoutFormProps {
  initialOpportunities: MarketOpportunity[]
  pulsePresets?: PulsePreset[]
}

export default function ScoutForm({ initialOpportunities, pulsePresets }: ScoutFormProps) {
  const router = useRouter()

  // Form state
  const [sport,     setSport]     = useState<Sport>('soccer')
  const [context,   setContext]   = useState('')
  const [timeframe, setTimeframe] = useState<Timeframe>('this_week')
  const [locale,    setLocale]    = useState<Locale>('auto')

  // Scout run state
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState('')
  const [disclaimer,  setDisclaimer]  = useState('')

  // Opportunities (server-fetched + client-added)
  const [opportunities, setOpportunities] = useState<MarketOpportunity[]>(initialOpportunities)

  // Per-card expand state
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  // Per-card action busy state
  const [actionBusy, setActionBusy] = useState<Set<string>>(new Set())

  const toggleExpand = useCallback((id: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) { next.delete(id) } else { next.add(id) }
      return next
    })
  }, [])

  // ── Scout run ───────────────────────────────────────────────
  const handleScout = useCallback(async () => {
    if (!context.trim()) {
      setError('Describe what you are looking for (league, teams, timeframe context…)')
      return
    }
    setError('')
    setDisclaimer('')
    setLoading(true)
    try {
      const res = await fetch('/api/scout', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          sport,
          context:         context.trim(),
          timeframe,
          output_language: locale,
        }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        setError(json.error ?? 'Scout failed. Please try again.')
        return
      }
      const { opportunities: newOpps, disclaimer: disc } = json.data as {
        opportunities: MarketOpportunity[]
        disclaimer:    string
      }
      setOpportunities(prev => [...newOpps, ...prev])
      if (disc) setDisclaimer(disc)
    } catch {
      setError('Network error — please try again.')
    } finally {
      setLoading(false)
    }
  }, [sport, context, timeframe, locale])

  // ── Opportunity actions ─────────────────────────────────────
  const handleAnalyse = useCallback((opp: MarketOpportunity) => {
    trackClientEvent(EVENTS.OPPORTUNITY_ANALYSED, {
      opportunity_id:    opp.id,
      sport_code:        opp.sport_code,
      opportunity_type:  opp.opportunity_type,
      scout_score_bucket: bucketScoutScore(opp.scout_score ?? 0),
    })
    const params = new URLSearchParams({ scout_id: opp.id, sport: opp.sport_code, event: opp.event_name, market: opp.market_type })
    if (opp.selection) params.set('selection', opp.selection)
    router.push(`/ai?${params.toString()}`)
  }, [router])

  const handleWatchlist = useCallback(async (opp: MarketOpportunity) => {
    setActionBusy(prev => new Set(prev).add(opp.id))
    try {
      const res = await fetch(`/api/scout/${opp.id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ status: 'watchlisted' }),
      })
      if (res.ok) {
        setOpportunities(prev => prev.map(o => o.id === opp.id ? { ...o, status: 'watchlisted' as const } : o))
        trackClientEvent(EVENTS.OPPORTUNITY_WATCHLISTED, { opportunity_id: opp.id, sport_code: opp.sport_code })
      }
    } finally {
      setActionBusy(prev => { const n = new Set(prev); n.delete(opp.id); return n })
    }
  }, [])

  const handleDismiss = useCallback(async (opp: MarketOpportunity) => {
    setActionBusy(prev => new Set(prev).add(opp.id))
    try {
      const res = await fetch(`/api/scout/${opp.id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ status: 'dismissed' }),
      })
      if (res.ok) {
        setOpportunities(prev => prev.filter(o => o.id !== opp.id))
        trackClientEvent(EVENTS.OPPORTUNITY_DISMISSED, { opportunity_id: opp.id, sport_code: opp.sport_code })
      }
    } finally {
      setActionBusy(prev => { const n = new Set(prev); n.delete(opp.id); return n })
    }
  }, [])

  return (
    <div className="flex flex-col gap-6">
      {/* ── Scout form ─────────────────────────────────────── */}
      <div className="card flex flex-col gap-4">
        {/* Event Pulse quick picks */}
        {pulsePresets && pulsePresets.length > 0 && (
          <div>
            <p className="label mb-2">Quick picks</p>
            <div className="flex flex-wrap gap-2">
              {pulsePresets.map(preset => (
                <button
                  key={preset.id}
                  onClick={() => {
                    setSport(preset.sport as Sport)
                    setContext(preset.context)
                    setError('')
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-night-700 bg-night-800 text-xs text-slate-300 hover:border-amber-700/40 hover:text-white transition-colors"
                >
                  <span>{preset.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Sport selector */}
        <div>
          <label className="label mb-2">Sport</label>
          <div className="flex flex-wrap gap-2">
            {SPORTS.map(s => (
              <button
                key={s.value}
                onClick={() => setSport(s.value)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                  sport === s.value
                    ? 'bg-indigo-600 border-indigo-500 text-white'
                    : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Context */}
        <div>
          <label className="label">What are you looking for?</label>
          <textarea
            className="input resize-none mt-1"
            rows={3}
            placeholder="e.g. Top Premier League fixtures this weekend — looking for underdog value or strong away sides…"
            value={context}
            onChange={e => { setContext(e.target.value); setError('') }}
          />
        </div>

        {/* Timeframe */}
        <div>
          <label className="label mb-2">Timeframe</label>
          <div className="flex gap-2">
            {TIMEFRAMES.map(t => (
              <button
                key={t.value}
                onClick={() => setTimeframe(t.value)}
                className={`flex-1 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                  timeframe === t.value
                    ? 'bg-indigo-600 border-indigo-500 text-white'
                    : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Language */}
        <div>
          <label className="label">Output language</label>
          <select className="input mt-1" value={locale} onChange={e => setLocale(e.target.value as Locale)}>
            {LOCALES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
          </select>
        </div>

        {/* Error */}
        {error && (
          <div className="text-xs text-red-400 bg-red-950/40 border border-red-900 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        {/* Submit */}
        <button
          className="btn-primary flex items-center justify-center gap-2"
          onClick={handleScout}
          disabled={loading}
        >
          {loading ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              Scouting…
            </>
          ) : (
            <>
              <Search size={14} strokeWidth={2} />
              Run Scout
            </>
          )}
        </button>
      </div>

      {/* ── Disclaimer ─────────────────────────────────────── */}
      {disclaimer && (
        <p className="text-xs text-gray-500 border border-gray-800 rounded-lg px-3 py-2 leading-relaxed flex items-start gap-2">
          <AlertTriangle size={12} className="shrink-0 mt-0.5 text-amber-500/60" />
          {disclaimer}
        </p>
      )}

      {/* ── Opportunities list ─────────────────────────────── */}
      {opportunities.length > 0 ? (
        <div className="flex flex-col gap-3">
          <p className="text-xs text-gray-600">{opportunities.length} opportunit{opportunities.length === 1 ? 'y' : 'ies'} · sorted by most recent</p>
          {opportunities.map(opp => (
            <OpportunityCard
              key={opp.id}
              opp={opp}
              expanded={expanded.has(opp.id)}
              actionBusy={actionBusy.has(opp.id)}
              onToggle={() => toggleExpand(opp.id)}
              onAnalyse={() => handleAnalyse(opp)}
              onWatch={() => handleWatchlist(opp)}
              onDismiss={() => handleDismiss(opp)}
            />
          ))}
        </div>
      ) : !loading && (
        <div className="card flex flex-col items-center gap-3 py-10 text-center">
          <Search size={28} strokeWidth={1.25} className="text-slate-600" />
          <p className="text-sm font-medium text-gray-400">No scouted opportunities yet</p>
          <p className="text-xs text-gray-600">Run Scout to find markets worth analysing.</p>
        </div>
      )}
    </div>
  )
}
