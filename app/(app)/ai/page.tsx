'use client'

import { useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

// ─── Types ────────────────────────────────────────────────────
type Sport = 'tennis' | 'soccer' | 'cs2' | 'basketball' | 'ice_hockey' | 'mma' | 'other'
type Locale = 'auto' | 'uk' | 'ru' | 'en' | 'es' | 'fr' | 'de' | 'ar'
type Recommendation = 'bet' | 'skip' | 'watch' | 'no_value'
type RiskLevel = 'low' | 'medium' | 'high'

interface Factor { name: string; score: number; detail: string }
interface Analysis {
  model_probability:   number
  implied_probability: number
  edge_percent:        number
  confidence_score:    number
  risk_level:          RiskLevel
  recommendation:      Recommendation
  reasoning:           string
  factors:             Factor[]
  disclaimer?:         string
  _meta: {
    sport: string; event_name: string; market_type: string
    selection: string | null; line: number | null; offered_odds: number
    bookmaker: string | null; output_language: string
    model_name: string; web_search_used: boolean
    input_chars: number; output_chars: number
  }
}

// ─── Constants ────────────────────────────────────────────────
const SPORTS: { value: Sport; label: string; icon: string }[] = [
  { value: 'soccer',     label: 'Soccer',      icon: '⚽' },
  { value: 'tennis',     label: 'Tennis',       icon: '🎾' },
  { value: 'cs2',        label: 'CS2',          icon: '🎯' },
  { value: 'basketball', label: 'Basketball',   icon: '🏀' },
  { value: 'ice_hockey', label: 'Ice Hockey',   icon: '🏒' },
  { value: 'mma',        label: 'MMA',          icon: '🥊' },
  { value: 'other',      label: 'Other',        icon: '🏅' },
]

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

const REC_CONFIG: Record<Recommendation, { label: string; color: string; bg: string }> = {
  bet:      { label: 'BET',      color: 'text-green-400',  bg: 'bg-green-950/50 border-green-800' },
  watch:    { label: 'WATCH',    color: 'text-yellow-400', bg: 'bg-yellow-950/50 border-yellow-800' },
  skip:     { label: 'SKIP',     color: 'text-gray-400',   bg: 'bg-gray-800/50 border-gray-700' },
  no_value: { label: 'NO VALUE', color: 'text-red-400',    bg: 'bg-red-950/50 border-red-800' },
}

const RISK_CONFIG: Record<RiskLevel, { label: string; color: string }> = {
  low:    { label: 'Low Risk',    color: 'text-green-400' },
  medium: { label: 'Medium Risk', color: 'text-yellow-400' },
  high:   { label: 'High Risk',   color: 'text-red-400' },
}

// ─── Score bar ────────────────────────────────────────────────
function ScoreBar({ score }: { score: number }) {
  const color = score > 0 ? 'bg-green-500' : score < 0 ? 'bg-red-500' : 'bg-gray-500'
  return (
    <div className="flex items-center gap-2 mt-0.5">
      <div className="flex-1 bg-gray-800 rounded-full h-1.5 relative">
        <div className="absolute left-1/2 top-0 bottom-0 w-px bg-gray-600" />
        <div
          className={`h-1.5 rounded-full ${color} transition-all`}
          style={{ width: `${Math.abs(score) / 3 * 50}%`, marginLeft: score >= 0 ? '50%' : `${50 - Math.abs(score) / 3 * 50}%` }}
        />
      </div>
      <span className={`text-xs font-mono w-6 text-right ${score > 0 ? 'text-green-400' : score < 0 ? 'text-red-400' : 'text-gray-500'}`}>
        {score > 0 ? `+${score}` : score}
      </span>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────
export default function AIAnalystPage() {
  const router   = useRouter()
  const supabase = createClient()

  const [sport,      setSport]      = useState<Sport>('soccer')
  const [locale,     setLocale]     = useState<Locale>('auto')
  const [form,       setForm]       = useState({ event_name: '', market_type: '', selection: '', line: '', odds: '', bookmaker: '', notes: '' })
  const [errors,     setErrors]     = useState<Record<string, string>>({})
  const [analysis,   setAnalysis]   = useState<Analysis | null>(null)
  const [analyzing,  setAnalyzing]  = useState(false)
  const [saving,     setSaving]     = useState(false)
  const [rootErr,    setRootErr]    = useState('')

  function setField(k: string, v: string) {
    setForm(f => ({ ...f, [k]: v }))
    setErrors(e => ({ ...e, [k]: '' }))
  }

  // ── Analyze ────────────────────────────────────────────────
  const handleAnalyze = useCallback(async () => {
    setErrors({})
    setRootErr('')
    setAnalysis(null)

    const newErrors: Record<string, string> = {}
    if (!form.event_name.trim()) newErrors.event_name = 'Required'
    if (!form.market_type.trim()) newErrors.market_type = 'Required'
    const odds = parseFloat(form.odds)
    if (!form.odds || isNaN(odds) || odds <= 1) newErrors.odds = 'Must be > 1.00'
    if (Object.keys(newErrors).length) { setErrors(newErrors); return }

    setAnalyzing(true)
    try {
      const res = await fetch('/api/ai/analyst', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sport,
          event_name:      form.event_name.trim(),
          market_type:     form.market_type.trim(),
          selection:       form.selection.trim() || undefined,
          line:            form.line ? parseFloat(form.line) : undefined,
          offered_odds:    odds,
          bookmaker:       form.bookmaker.trim() || undefined,
          notes:           form.notes.trim() || undefined,
          output_language: locale,
        }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        setRootErr(json.error ?? 'Analysis failed. Try again.')
        return
      }
      setAnalysis(json.data)
    } catch {
      setRootErr('Network error — please try again.')
    } finally {
      setAnalyzing(false)
    }
  }, [sport, locale, form])

  // ── Save decision (+ optional bet) ────────────────────────
  const handleAction = useCallback(async (action: 'placed' | 'skipped' | 'watchlisted') => {
    if (!analysis) return
    setSaving(true)
    setRootErr('')

    try {
      const m = analysis._meta
      const outputJson = {
        model_probability:   analysis.model_probability,
        implied_probability: analysis.implied_probability,
        edge_percent:        analysis.edge_percent,
        confidence_score:    analysis.confidence_score,
        risk_level:          analysis.risk_level,
        recommendation:      analysis.recommendation,
        reasoning:           analysis.reasoning,
        factors:             analysis.factors,
        disclaimer:          analysis.disclaimer,
      }

      // For 'placed', we need a stake — use a prompt for now
      let stake: number | null = null
      if (action === 'placed') {
        const raw = window.prompt('Stake amount:')
        if (!raw) { setSaving(false); return }
        stake = parseFloat(raw)
        if (!stake || stake <= 0) { setRootErr('Invalid stake'); setSaving(false); return }
      }

      // 1. Create decision + analysis run atomically
      const { data: rpcData, error: rpcErr } = await supabase.rpc('create_decision_with_analysis', {
        p_sport:               m.sport,
        p_event_name:          m.event_name,
        p_market_type:         m.market_type,
        p_selection:           m.selection,
        p_line:                m.line,
        p_offered_odds:        m.offered_odds,
        p_bookmaker:           m.bookmaker,
        p_output_language:     m.output_language === 'auto' ? null : m.output_language,
        p_model_probability:   analysis.model_probability,
        p_implied_probability: analysis.implied_probability,
        p_edge_percent:        analysis.edge_percent,
        p_confidence_score:    analysis.confidence_score,
        p_risk_level:          analysis.risk_level,
        p_recommendation:      analysis.recommendation,
        p_reasoning:           analysis.reasoning,
        p_factors:             JSON.stringify(analysis.factors),
        p_model_name:          m.model_name,
        p_output_json:         JSON.stringify(outputJson),
        p_web_search_used:     m.web_search_used,
        p_input_chars:         m.input_chars,
        p_output_chars:        m.output_chars,
      })

      if (rpcErr) throw new Error(rpcErr.message || rpcErr.details || JSON.stringify(rpcErr))

      const decisionId = (rpcData as { decision_id: string }).decision_id

      // 2. If placing bet, call place_bet_from_decision
      if (action === 'placed' && stake) {
        const { error: betErr } = await supabase.rpc('place_bet_from_decision', {
          p_decision_id: decisionId,
          p_stake:       stake,
          p_bookmaker:   m.bookmaker,
        })
        if (betErr) throw new Error(betErr.message || betErr.details || JSON.stringify(betErr))
      } else if (action !== 'placed') {
        // Mark skip or watch
        const { error: actionErr } = await supabase.rpc('update_decision_action', {
          p_decision_id:  decisionId,
          p_final_action: action,
        })
        if (actionErr) throw new Error(actionErr.message || actionErr.details || JSON.stringify(actionErr))
      }

      router.push(`/decisions/${decisionId}`)
      router.refresh()

    } catch (err: unknown) {
      setRootErr(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }, [analysis, supabase, router])

  const a = analysis

  return (
    <div className="max-w-2xl flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-white">AI Analyst</h1>
        <p className="text-sm text-gray-500 mt-1">Get a structured analysis before you decide</p>
      </div>

      {/* ── Sport selector ──────────────────────────────────── */}
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
              {s.icon} {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Form ────────────────────────────────────────────── */}
      <div className="card flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="label">Event *</label>
            <input
              className={`input ${errors.event_name ? 'border-red-600' : ''}`}
              placeholder="Germany vs Netherlands"
              value={form.event_name}
              onChange={e => setField('event_name', e.target.value)}
            />
            {errors.event_name && <p className="text-xs text-red-400 mt-1">{errors.event_name}</p>}
          </div>

          <div>
            <label className="label">Market *</label>
            <input
              className={`input ${errors.market_type ? 'border-red-600' : ''}`}
              placeholder="Match Winner / Total / Handicap"
              value={form.market_type}
              onChange={e => setField('market_type', e.target.value)}
            />
            {errors.market_type && <p className="text-xs text-red-400 mt-1">{errors.market_type}</p>}
          </div>

          <div>
            <label className="label">Selection</label>
            <input
              className="input"
              placeholder="Germany / Over / -1"
              value={form.selection}
              onChange={e => setField('selection', e.target.value)}
            />
          </div>

          <div>
            <label className="label">Odds *</label>
            <input
              className={`input ${errors.odds ? 'border-red-600' : ''}`}
              type="number" step="0.01" min="1.01" placeholder="1.85"
              value={form.odds}
              onChange={e => setField('odds', e.target.value)}
            />
            {errors.odds && <p className="text-xs text-red-400 mt-1">{errors.odds}</p>}
          </div>

          <div>
            <label className="label">Line</label>
            <input
              className="input"
              type="number" step="0.5" placeholder="+1.5 / 2.5"
              value={form.line}
              onChange={e => setField('line', e.target.value)}
            />
          </div>

          <div>
            <label className="label">Bookmaker</label>
            <input
              className="input"
              placeholder="Bet365, Pinnacle…"
              value={form.bookmaker}
              onChange={e => setField('bookmaker', e.target.value)}
            />
          </div>

          <div>
            <label className="label">Output language</label>
            <select className="input" value={locale} onChange={e => setLocale(e.target.value as Locale)}>
              {LOCALES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
            </select>
          </div>

          <div className="col-span-2">
            <label className="label">Context / Notes</label>
            <textarea
              className="input resize-none" rows={2}
              placeholder="Injuries, lineups, motivation, recent form, anything relevant…"
              value={form.notes}
              onChange={e => setField('notes', e.target.value)}
            />
          </div>
        </div>

        {rootErr && !analysis && (
          <div className="text-xs text-red-400 bg-red-950/40 border border-red-900 rounded-lg px-3 py-2">
            {rootErr}
          </div>
        )}

        <button
          className="btn-primary"
          onClick={handleAnalyze}
          disabled={analyzing}
        >
          {analyzing ? (
            <span className="flex items-center justify-center gap-2">
              <span className="animate-spin">⏳</span> Analyzing…
            </span>
          ) : '🔍 Analyze'}
        </button>
      </div>

      {/* ── Analysis result ─────────────────────────────────── */}
      {a && (
        <div className="flex flex-col gap-4">
          {/* Recommendation header */}
          {(() => {
            const rec = REC_CONFIG[a.recommendation]
            const risk = RISK_CONFIG[a.risk_level]
            return (
              <div className={`card border ${rec.bg} flex flex-col gap-3`}>
                <div className="flex items-center justify-between">
                  <span className={`text-lg font-bold ${rec.color}`}>{rec.label}</span>
                  <span className={`text-xs font-medium ${risk.color}`}>{risk.label}</span>
                </div>

                {/* Probabilities */}
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div>
                    <div className="text-xs text-gray-500 mb-0.5">Model prob.</div>
                    <div className="text-xl font-bold text-white">{a.model_probability.toFixed(1)}%</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 mb-0.5">Implied</div>
                    <div className="text-xl font-bold text-gray-300">{a.implied_probability.toFixed(1)}%</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 mb-0.5">Edge</div>
                    <div className={`text-xl font-bold ${a.edge_percent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {a.edge_percent >= 0 ? '+' : ''}{a.edge_percent.toFixed(1)}%
                    </div>
                  </div>
                </div>

                {/* Confidence */}
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-gray-500">Confidence</span>
                    <span className="text-gray-300">{a.confidence_score}/100</span>
                  </div>
                  <div className="bg-gray-800 rounded-full h-1.5">
                    <div
                      className="h-1.5 rounded-full bg-indigo-500 transition-all"
                      style={{ width: `${a.confidence_score}%` }}
                    />
                  </div>
                </div>

                {/* Reasoning */}
                <p className="text-sm text-gray-300 leading-relaxed">{a.reasoning}</p>

                {/* Disclaimer */}
                {a.disclaimer && (
                  <p className="text-xs text-gray-500 border-t border-gray-700 pt-2 mt-1">{a.disclaimer}</p>
                )}
              </div>
            )
          })()}

          {/* Factors */}
          <div className="card flex flex-col gap-2">
            <h3 className="text-sm font-semibold text-gray-300 mb-1">Factor Analysis</h3>
            {a.factors.map((f, i) => (
              <div key={i} className="py-1.5 border-b border-gray-800 last:border-0">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-200">{f.name}</span>
                </div>
                <ScoreBar score={f.score} />
                <p className="text-xs text-gray-500 mt-1">{f.detail}</p>
              </div>
            ))}
          </div>

          {/* Actions */}
          {rootErr && (
            <div className="text-xs text-red-400 bg-red-950/40 border border-red-900 rounded-lg px-3 py-2">
              {rootErr}
            </div>
          )}

          <div className="flex gap-3">
            <button
              className="btn-primary flex-1"
              onClick={() => handleAction('placed')}
              disabled={saving}
            >
              {saving ? 'Saving…' : '✅ Place Bet'}
            </button>
            <button
              className="flex-1 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-medium transition-colors border border-gray-700 disabled:opacity-50"
              onClick={() => handleAction('watchlisted')}
              disabled={saving}
            >
              👁 Watch
            </button>
            <button
              className="flex-1 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 text-sm font-medium transition-colors border border-gray-700 disabled:opacity-50"
              onClick={() => handleAction('skipped')}
              disabled={saving}
            >
              ✕ Skip
            </button>
          </div>
          <p className="text-xs text-gray-600 text-center">Skipping or watching is a valid decision — it will be saved to your history.</p>
        </div>
      )}
    </div>
  )
}
