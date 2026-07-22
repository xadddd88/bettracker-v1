'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { trackClientEvent } from '@/lib/analytics/client'
import { EVENTS } from '@/lib/analytics/events'
import { bucketScoutScore } from '@/lib/analytics/buckets'
import type { MarketOpportunity, OpportunityStatus } from '@/types'
import { Search, Eye, X, Loader2, AlertTriangle } from 'lucide-react'
import BetaNote from '@/components/ui/BetaNote'

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
  value:      'text-[var(--text-primary)]',
  contrarian: 'text-[var(--text-primary)]',
  pattern:    'text-[var(--text-primary)]',
  general:    'text-[var(--text-muted)]',
}

const STATUS_BADGE: Record<OpportunityStatus, { label: string; style: string } | null> = {
  discovered:            null,
  research_needed:       { label: '! In analysis', style: 'bn-status-review' },
  watchlisted:           { label: '• Watching',    style: 'bn-status-neutral' },
  converted_to_decision: { label: '✓ Converted',   style: 'bn-status-success' },
  dismissed:             null,
  expired:               null,
}

function scoreStyle(score: number): string {
  if (score >= 70) return 'border-[var(--border-strong)] text-[var(--data-value)]'
  if (score >= 40) return 'border-[var(--border-strong)] text-[var(--data-value)]'
  return 'border-[var(--border-strong)] text-[var(--text-muted)]'
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
  const typeColor = TYPE_STYLE[opp.opportunity_type] ?? 'text-[var(--text-muted)]'
  const statusBadge = STATUS_BADGE[opp.status]
  const score = opp.scout_score ?? 0
  const REASONING_LIMIT = 140

  return (
    <div className="bn-panel flex flex-col gap-3 p-4 sm:p-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="border border-[var(--border-strong)] bg-[var(--field-raised)] px-2 py-1 font-mono text-[11px] font-bold text-[var(--text-muted)]">{sportAbbr}</span>
            <span className="break-words text-sm font-semibold text-[var(--text-primary)]">{opp.event_name}</span>
          </div>
          <div className="mt-1 text-xs text-[var(--text-muted)]">
            {opp.market_type}{opp.selection ? ` · ${opp.selection}` : ''}
          </div>
        </div>
        {statusBadge && (
          <span className={`bn-status shrink-0 ${statusBadge.style}`}>
            {statusBadge.label}
          </span>
        )}
      </div>

      {/* Tags row */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`text-[11px] font-semibold uppercase tracking-wide ${typeColor}`}>
          {opp.opportunity_type}
        </span>
        <span className="text-[var(--border-strong)]">·</span>
        <span className={`border px-2 py-1 font-mono text-[11px] font-bold ${scoreStyle(score)}`}>
          Relevance {score}/100
        </span>
        {opp.risk_level && (
          <>
            <span className="text-[var(--border-strong)]">·</span>
            <span className={`text-[11px] font-bold ${
              opp.risk_level === 'low' ? 'text-[var(--text-muted)]' :
              opp.risk_level === 'medium' ? 'text-[var(--review)]' : 'text-[var(--negative)]'
            }`}>
              {opp.risk_level.charAt(0).toUpperCase() + opp.risk_level.slice(1)} risk
            </span>
          </>
        )}
        {/* FP-001: model_probability is never displayed — Scout candidates are
            research leads without a verified data basis, not priced signals. */}
        {opp.match_date && (
          <>
            <span className="text-[var(--border-strong)]">·</span>
            <span className="text-[11px] text-[var(--text-muted)]">
              {fmtMatchDate(opp.match_date)}
            </span>
          </>
        )}
      </div>

      {/* Reasoning */}
      <div>
        <p className="text-sm leading-relaxed text-[var(--text-primary)]">
          {expanded || opp.reasoning.length <= REASONING_LIMIT
            ? opp.reasoning
            : `${opp.reasoning.slice(0, REASONING_LIMIT)}…`}
        </p>
        {opp.reasoning.length > REASONING_LIMIT && (
          <button
            onClick={onToggle}
            className="mt-1 min-h-11 text-left text-xs font-bold text-[var(--signal)] transition-colors"
          >
            {expanded ? 'Show less' : 'Show more'}
          </button>
        )}
      </div>

      {/* Required checks */}
      {opp.required_checks && opp.required_checks.length > 0 && (
        <div>
          <p className="editorial-kicker mb-1">
            Required checks
          </p>
          <ul className="flex flex-col gap-0.5">
            {opp.required_checks.map((check, i) => (
              <li key={i} className="flex items-start gap-1.5 text-xs text-[var(--text-muted)]">
                <span className="mt-0.5 shrink-0 text-[var(--border-strong)]">•</span>
                {check}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Actions */}
      {opp.status !== 'converted_to_decision' && (
        <div className="grid grid-cols-1 gap-2 border-t border-[var(--border-subtle)] pt-3 sm:grid-cols-[1fr_1fr_auto]">
          <button
            className="bn-button bn-button-primary w-full"
            onClick={onAnalyse}
            disabled={actionBusy}
          >
            <Search size={13} strokeWidth={2} />
            Analyze
          </button>
          <button
            className="bn-button bn-button-secondary w-full"
            onClick={onWatch}
            disabled={actionBusy || opp.status === 'watchlisted'}
          >
            <Eye size={13} strokeWidth={2} />
            {opp.status === 'watchlisted' ? 'Watching' : 'Watchlist'}
          </button>
          <button
            className="bn-button bn-button-secondary w-full px-3 sm:w-11"
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
    <div className="bn-page flex flex-col gap-6">
      {/* ── Scout form ─────────────────────────────────────── */}
      <div className="bn-panel flex flex-col gap-4 p-4 sm:p-5">
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
                  className="bn-button bn-button-secondary"
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
                className={`bn-button ${
                  sport === s.value
                    ? 'bn-button-primary'
                    : 'bn-button-secondary'
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
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {TIMEFRAMES.map(t => (
              <button
                key={t.value}
                onClick={() => setTimeframe(t.value)}
                className={`bn-button w-full ${
                  timeframe === t.value
                    ? 'bn-button-primary'
                    : 'bn-button-secondary'
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
          <div className="bn-status bn-status-negative w-full justify-start" role="alert">
            <span className="bn-status-icon" aria-hidden>×</span><span>{error}</span>
          </div>
        )}

        {/* Submit */}
        <button
          className="bn-button bn-button-primary w-full sm:w-auto sm:self-start"
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
        <p className="bn-panel flex items-start gap-2 border-[var(--review)] px-3 py-3 text-xs leading-relaxed text-[var(--text-muted)]">
          <AlertTriangle size={14} className="mt-0.5 shrink-0 text-[var(--review)]" />
          {disclaimer}
        </p>
      )}

      {/* ── Opportunities list ─────────────────────────────── */}
      {opportunities.length > 0 ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <p className="text-xs text-[var(--text-muted)]">{opportunities.length} opportunit{opportunities.length === 1 ? 'y' : 'ies'} · sorted by most recent</p>
            <p className="text-xs leading-relaxed text-[var(--text-muted)]">
              <span className="font-bold text-[var(--text-primary)]">value</span> = candidate to investigate ·{' '}
              <span className="font-bold text-[var(--text-primary)]">contrarian</span> = alternative angle ·{' '}
              <span className="font-bold text-[var(--text-primary)]">pattern</span> = contextual pattern ·{' '}
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
        <div className="bn-panel flex flex-col items-center gap-3 px-5 py-10 text-center">
          <Search size={28} strokeWidth={1.25} className="text-[var(--border-strong)]" />
          <p className="text-sm font-medium text-[var(--text-primary)]">No scouted opportunities yet</p>
          <p className="text-xs text-[var(--text-muted)]">Run Scout to find markets worth analyzing.</p>
        </div>
      )}
    </div>
  )
}
