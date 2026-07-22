'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { trackClientEvent } from '@/lib/analytics/client'
import { EVENTS } from '@/lib/analytics/events'
import { bucketScoutScore } from '@/lib/analytics/buckets'
import type { MarketOpportunity, OpportunityStatus } from '@/types'
import { Search, Eye, X, AlertTriangle } from 'lucide-react'
import BetaNote from '@/components/ui/BetaNote'
import { BroadcastButton, BroadcastDataValue, BroadcastPanel, BroadcastStatus } from '@/components/ui/BroadcastNoir'
import type { BroadcastNoirStatus } from '@/lib/ui/broadcast-noir'

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

const STATUS_BADGE: Record<OpportunityStatus, { label: string; status: BroadcastNoirStatus } | null> = {
  discovered:            null,
  research_needed:       { label: 'In Analysis', status: 'review' },
  watchlisted:           { label: 'Watching', status: 'review' },
  converted_to_decision: { label: 'Converted', status: 'success' },
  dismissed:             null,
  expired:               null,
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
  const statusBadge = STATUS_BADGE[opp.status]
  const score = opp.scout_score ?? 0
  const REASONING_LIMIT = 140

  return (
    <BroadcastPanel className="flex flex-col gap-3 p-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="rounded-control border border-bn-border-subtle bg-bn-raised px-1.5 py-0.5 font-mono text-[10px] font-bold text-bn-muted">{sportAbbr}</span>
            <span className="truncate text-sm font-semibold text-bn-text">{opp.event_name}</span>
          </div>
          <div className="mt-0.5 text-xs text-bn-muted">
            {opp.market_type}{opp.selection ? ` · ${opp.selection}` : ''}
          </div>
        </div>
        {statusBadge && (
          <BroadcastStatus className="shrink-0" status={statusBadge.status}>{statusBadge.label}</BroadcastStatus>
        )}
      </div>

      {/* Tags row */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-bn-muted">
          {opp.opportunity_type}
        </span>
        <span className="text-bn-quiet">·</span>
        <BroadcastDataValue className="text-[11px] font-medium">Score {score}</BroadcastDataValue>
        {opp.risk_level && (
          <>
            <span className="text-bn-quiet">·</span>
            <BroadcastStatus status={opp.risk_level === 'high' ? 'negative' : opp.risk_level === 'medium' ? 'review' : 'neutral'}>
              {opp.risk_level.charAt(0).toUpperCase() + opp.risk_level.slice(1)} risk
            </BroadcastStatus>
          </>
        )}
        {/* FP-001: model_probability is never displayed — Scout candidates are
            research leads without a verified data basis, not priced signals. */}
        {opp.match_date && (
          <>
            <span className="text-bn-quiet">·</span>
            <span className="text-[11px] text-bn-muted">
              {fmtMatchDate(opp.match_date)}
            </span>
          </>
        )}
      </div>

      {/* Reasoning */}
      <div>
        <p className="text-sm leading-relaxed text-bn-text">
          {expanded || opp.reasoning.length <= REASONING_LIMIT
            ? opp.reasoning
            : `${opp.reasoning.slice(0, REASONING_LIMIT)}…`}
        </p>
        {opp.reasoning.length > REASONING_LIMIT && (
          <button
            onClick={onToggle}
            className="mt-1 min-h-11 text-xs font-bold text-bn-text underline underline-offset-4"
          >
            {expanded ? 'Show less' : 'Show more'}
          </button>
        )}
      </div>

      {/* Required checks */}
      {opp.required_checks && opp.required_checks.length > 0 && (
        <div>
          <p className="mb-1 font-mono text-[11px] font-medium uppercase tracking-wide text-bn-quiet">
            Required checks
          </p>
          <ul className="flex flex-col gap-0.5">
            {opp.required_checks.map((check, i) => (
              <li key={i} className="flex items-start gap-1.5 text-xs text-bn-muted">
                <span className="mt-0.5 shrink-0 text-bn-quiet" aria-hidden>•</span>
                {check}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Actions */}
      {opp.status !== 'converted_to_decision' && (
        <div className="flex gap-2 border-t border-bn-border-subtle pt-2">
          <BroadcastButton
            className="flex flex-1 items-center justify-center gap-1.5"
            onClick={onAnalyse}
            disabled={actionBusy}
          >
            <Search size={13} strokeWidth={2} />
            Analyze
          </BroadcastButton>
          <BroadcastButton
            tone="secondary"
            className="flex flex-1 items-center justify-center gap-1.5"
            onClick={onWatch}
            disabled={actionBusy || opp.status === 'watchlisted'}
          >
            <Eye size={13} strokeWidth={2} />
            {opp.status === 'watchlisted' ? 'Watching' : 'Watchlist'}
          </BroadcastButton>
          <BroadcastButton
            tone="secondary"
            aria-label={`Dismiss ${opp.event_name}`}
            onClick={onDismiss}
            disabled={actionBusy}
            title="Dismiss"
          >
            <X size={13} strokeWidth={2} />
          </BroadcastButton>
        </div>
      )}
    </BroadcastPanel>
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
      <BroadcastPanel className="flex flex-col gap-4 p-4 sm:p-5">
        {/* Event Pulse quick picks */}
        {pulsePresets && pulsePresets.length > 0 && (
          <div>
            <p className="label mb-2">Quick picks</p>
            <div className="flex flex-wrap gap-2">
              {pulsePresets.map(preset => (
                <BroadcastButton
                  key={preset.id}
                  onClick={() => {
                    setSport(preset.sport as Sport)
                    setContext(preset.context)
                    setError('')
                  }}
                  tone="secondary"
                >
                  <span>{preset.label}</span>
                </BroadcastButton>
              ))}
            </div>
          </div>
        )}

        {/* Sport selector */}
        <div>
          <label className="label mb-2">Sport</label>
          <div className="flex flex-wrap gap-2">
            {SPORTS.map(s => (
              <BroadcastButton
                key={s.value}
                onClick={() => setSport(s.value)}
                aria-pressed={sport === s.value}
                tone={sport === s.value ? 'primary' : 'secondary'}
              >
                {s.label}
              </BroadcastButton>
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
              <BroadcastButton
                key={t.value}
                onClick={() => setTimeframe(t.value)}
                aria-pressed={timeframe === t.value}
                className="flex-1"
                tone={timeframe === t.value ? 'primary' : 'secondary'}
              >
                {t.label}
              </BroadcastButton>
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
          <BroadcastStatus className="w-full" status="negative">{error}</BroadcastStatus>
        )}

        {/* Submit */}
        <BroadcastButton
          className="flex items-center justify-center gap-2"
          onClick={handleScout}
          disabled={loading}
        >
          {loading ? (
            <>
              Scouting…
            </>
          ) : (
            <>
              <Search size={14} strokeWidth={2} />
              Run Scout
            </>
          )}
        </BroadcastButton>
      </BroadcastPanel>

      {/* ── Disclaimer ─────────────────────────────────────── */}
      {disclaimer && (
        <BroadcastPanel className="flex items-start gap-2 p-3 text-xs leading-relaxed text-bn-muted"><AlertTriangle aria-hidden size={12} className="mt-0.5 shrink-0 text-bn-review" />{disclaimer}</BroadcastPanel>
      )}

      {/* ── Opportunities list ─────────────────────────────── */}
      {opportunities.length > 0 ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <p className="text-xs text-bn-muted">{opportunities.length} opportunit{opportunities.length === 1 ? 'y' : 'ies'} · sorted by most recent</p>
            <p className="text-[10px] text-bn-quiet">
              value = candidate to investigate · contrarian = alternative angle · pattern = contextual pattern ·{' '}
              score 0–100 = research relevance, not probability or price edge · Analyze → AI Analyst
            </p>
          </div>
          {opportunities.length < 5 && (
            <BetaNote>Scout may return fewer candidates when low-quality or incomplete candidates are filtered out.</BetaNote>
          )}
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
        <BroadcastPanel className="flex flex-col items-center gap-3 py-10 text-center"><BroadcastStatus status="neutral">Empty</BroadcastStatus><p className="text-sm font-medium text-bn-text">No scouted opportunities yet</p><p className="text-xs text-bn-muted">Run Scout to find markets worth analyzing.</p></BroadcastPanel>
      )}
    </div>
  )
}
