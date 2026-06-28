'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { trackClientEvent } from '@/lib/analytics/client'
import { EVENTS } from '@/lib/analytics/events'
import { bucketOdds } from '@/lib/analytics/buckets'

// ─── Image helper ─────────────────────────────────────────────
function fileToBase64(file: File): Promise<{ data: string; media_type: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      const [header, data] = result.split(',')
      const media_type = header.match(/data:(.*);base64/)?.[1] ?? 'image/jpeg'
      resolve({ data, media_type })
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

// ─── Types ────────────────────────────────────────────────────
type Sport = 'tennis' | 'soccer' | 'cs2' | 'basketball' | 'ice_hockey' | 'mma' | 'other'
type Locale = 'auto' | 'uk' | 'ru' | 'en' | 'es' | 'fr' | 'de' | 'ar'
type Recommendation = 'bet' | 'skip' | 'watch' | 'no_value'
type RiskLevel = 'low' | 'medium' | 'high'

interface Factor { name: string; score: number; detail: string }
interface Analysis {
  decision_id:      string
  analysis_run_id?: string | null
  // AI output (server-corrected)
  model_probability:   number
  implied_probability: number
  edge_percent:        number
  confidence_score:    number
  risk_level:          RiskLevel
  recommendation:      Recommendation
  reasoning:           string
  factors:             Factor[]
  disclaimer:          string
  // Input echoed back from server
  sport:           string
  event_name:      string
  market_type:     string
  selection:       string | null
  line:            number | null
  offered_odds:    number
  bookmaker:       string | null
  output_language: string
}

// ─── Constants ────────────────────────────────────────────────
const SPORTS: { value: Sport; label: string; icon: string }[] = [
  { value: 'soccer',     label: 'Football',     icon: '\u26BD' },
  { value: 'tennis',     label: 'Tennis',       icon: '\uD83C\uDFBE' },
  { value: 'cs2',        label: 'CS2',          icon: '\uD83C\uDFAF' },
  { value: 'basketball', label: 'Basketball',   icon: '\uD83C\uDFC0' },
  { value: 'ice_hockey', label: 'Ice Hockey',   icon: '\uD83C\uDFD2' },
  { value: 'mma',        label: 'MMA',          icon: '\uD83E\uDD4A' },
  { value: 'other',      label: 'Other',        icon: '\uD83C\uDFC5' },
]

const LOCALES: { value: Locale; label: string }[] = [
  { value: 'auto', label: 'Auto (detect)' },
  { value: 'en',   label: 'English' },
  { value: 'uk',   label: '\u0423\u043A\u0440\u0430\u0457\u043D\u0441\u044C\u043A\u0430' },
  { value: 'ru',   label: '\u0420\u0443\u0441\u0441\u043A\u0438\u0439' },
  { value: 'es',   label: 'Espa\u00F1ol' },
  { value: 'fr',   label: 'Fran\u00E7ais' },
  { value: 'de',   label: 'Deutsch' },
  { value: 'ar',   label: '\u0627\u0644\u0639\u0631\u0628\u064A\u0629' },
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

  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => { trackClientEvent(EVENTS.AI_PAGE_VIEWED) }, [])

  const [sport,      setSport]      = useState<Sport>('soccer')
  const [locale,     setLocale]     = useState<Locale>('auto')
  const [form,       setForm]       = useState({ event_name: '', market_type: '', selection: '', line: '', odds: '', bookmaker: '', notes: '' })
  const [errors,     setErrors]     = useState<Record<string, string>>({})
  const [analysis,   setAnalysis]   = useState<Analysis | null>(null)
  const [analyzing,  setAnalyzing]  = useState(false)
  const [saving,     setSaving]     = useState(false)
  const [rootErr,    setRootErr]    = useState('')
  const [scanning,   setScanning]   = useState(false)
  const [scanMsg,    setScanMsg]    = useState('')
  const [stakeStr,   setStakeStr]   = useState('')
  const [showStake,  setShowStake]  = useState(false)

  function setField(k: string, v: string) {
    setForm(f => ({ ...f, [k]: v }))
    setErrors(e => ({ ...e, [k]: '' }))
  }

  // ── Scanner ────────────────────────────────────────────────
  const runScanner = useCallback(async (file: File) => {
    setScanning(true)
    setScanMsg('Scanning coupon...')
    try {
      const { data, media_type } = await fileToBase64(file)
      const res = await fetch('/api/ai/scanner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: data, media_type }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) { setScanMsg(json.error ?? 'Scan failed'); return }
      const d = json.data
      const SPORTS_LIST: Sport[] = ['tennis', 'soccer', 'cs2', 'basketball', 'ice_hockey', 'mma', 'other']
      setForm(prev => ({
        ...prev,
        event_name:  d.event_name  ?? prev.event_name,
        market_type: d.market_type ?? prev.market_type,
        selection:   d.selection   ?? prev.selection,
        odds:        d.odds != null ? String(d.odds) : prev.odds,
        bookmaker:   d.bookmaker   ?? prev.bookmaker,
      }))
      if (SPORTS_LIST.includes(d.sport)) setSport(d.sport as Sport)
      setScanMsg('\u2705 Coupon scanned \u2014 review and analyze')
    } catch {
      setScanMsg('Scan error \u2014 try again')
    } finally {
      setScanning(false)
    }
  }, [])

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const imageItem = Array.from(e.clipboardData.items).find(i => i.type.startsWith('image/'))
    if (imageItem) { const f = imageItem.getAsFile(); if (f) runScanner(f) }
  }, [runScanner])

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (f) runScanner(f); e.target.value = ''
  }, [runScanner])

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
    setShowStake(false)
    setStakeStr('')
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
      setRootErr('Network error \u2014 please try again.')
    } finally {
      setAnalyzing(false)
    }
  }, [sport, locale, form])

  // ── Act on already-persisted decision ─────────────────────
  // Decision is created immediately by /api/ai/analyst.
  // handleAction only calls the 2nd RPC (place or mark).
  const handleAction = useCallback(async (action: 'placed' | 'skipped' | 'watchlisted') => {
    if (!analysis) return
    if (!analysis.decision_id) {
      setRootErr('Decision ID missing \u2014 please re-analyze (restart dev server if in development)')
      return
    }

    if (action === 'watchlisted') {
      trackClientEvent(EVENTS.DECISION_ACTION_WATCH, { decision_id: analysis.decision_id, from_page: 'ai_page' })
    }
    if (action === 'skipped') {
      trackClientEvent(EVENTS.DECISION_ACTION_SKIP, { decision_id: analysis.decision_id, from_page: 'ai_page' })
    }

    if (action === 'placed') {
      const stake = parseFloat(stakeStr)
      if (!stakeStr || isNaN(stake) || stake <= 0) {
        setRootErr('Enter a valid stake amount')
        return
      }
      setSaving(true)
      setRootErr('')
      try {
        const { error: betErr } = await supabase.rpc('place_bet_from_decision', {
          p_decision_id: analysis.decision_id,
          p_stake:       stake,
          p_bookmaker:   analysis.bookmaker,
        })
        if (betErr) throw new Error(betErr.message || betErr.details || JSON.stringify(betErr))
        router.push(`/decisions/${analysis.decision_id}`)
      } catch (err: unknown) {
        setRootErr(err instanceof Error ? err.message : String(err))
      } finally {
        setSaving(false)
      }
      return
    }

    // Watch or Skip
    setSaving(true)
    setRootErr('')
    try {
      const { error: actionErr } = await supabase.rpc('update_decision_action', {
        p_decision_id:  analysis.decision_id,
        p_final_action: action,
      })
      if (actionErr) throw new Error(actionErr.message || actionErr.details || JSON.stringify(actionErr))
      router.push(`/decisions/${analysis.decision_id}`)
    } catch (err: unknown) {
      setRootErr(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }, [analysis, stakeStr, supabase, router])

  // ── PDF download ───────────────────────────────────────────
  const downloadPDF = useCallback(() => {
    if (!analysis) return
    const a = analysis
    const recLabels: Record<string, string> = { bet: 'BET', skip: 'SKIP', watch: 'WATCH', no_value: 'NO VALUE' }
    const factorsHtml = a.factors.map(f =>
      `<tr><td>${f.name}</td><td style="text-align:center;font-weight:bold;color:${f.score>0?'#22c55e':f.score<0?'#ef4444':'#9ca3af'}">${f.score>0?'+':''}${f.score}</td><td style="color:#9ca3af;font-size:12px">${f.detail}</td></tr>`
    ).join('')
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>AI Analysis \u2014 ${a.event_name}</title>
<style>
  body{font-family:system-ui,sans-serif;max-width:700px;margin:40px auto;padding:20px;color:#111;background:#fff}
  h1{font-size:22px;margin-bottom:4px}
  .meta{color:#666;font-size:13px;margin-bottom:20px}
  .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:16px 0}
  .stat{background:#f8f8f8;padding:12px;border-radius:8px;text-align:center}
  .stat-label{font-size:11px;color:#888;margin-bottom:4px}
  .stat-value{font-size:22px;font-weight:700}
  .rec{display:inline-block;padding:4px 12px;border-radius:6px;font-weight:700;font-size:14px;background:#f0f0f0;margin-bottom:12px}
  .reasoning{background:#f8f8f8;padding:14px;border-radius:8px;margin:12px 0;line-height:1.6}
  table{width:100%;border-collapse:collapse;margin-top:12px}
  th{text-align:left;font-size:12px;color:#888;padding:6px 8px;border-bottom:1px solid #eee}
  td{padding:7px 8px;border-bottom:1px solid #f0f0f0;font-size:13px;vertical-align:top}
  .disclaimer{font-size:11px;color:#999;margin-top:16px;padding-top:12px;border-top:1px solid #eee}
  .footer{margin-top:24px;font-size:11px;color:#bbb;text-align:center}
  @media print{body{margin:20px}}
</style></head><body>
<h1>${a.event_name}</h1>
<div class="meta">${a.sport.toUpperCase()} \u00B7 ${a.market_type}${a.selection?' \u00B7 '+a.selection:''} \u00B7 @${a.offered_odds}${a.bookmaker?' \u00B7 '+a.bookmaker:''}</div>
<div class="rec">${recLabels[a.recommendation]??a.recommendation}</div>
<div class="grid">
  <div class="stat"><div class="stat-label">Model probability</div><div class="stat-value">${a.model_probability.toFixed(1)}%</div></div>
  <div class="stat"><div class="stat-label">Implied probability</div><div class="stat-value">${a.implied_probability.toFixed(1)}%</div></div>
  <div class="stat"><div class="stat-label">Edge</div><div class="stat-value" style="color:${a.edge_percent>=0?'#16a34a':'#dc2626'}">${a.edge_percent>=0?'+':''}${a.edge_percent.toFixed(1)}%</div></div>
</div>
<div class="reasoning">${a.reasoning}</div>
${a.disclaimer?`<div class="disclaimer">${a.disclaimer}</div>`:''}
<h3 style="margin-top:20px;font-size:14px">Factor Analysis</h3>
<table><thead><tr><th>Factor</th><th>Score</th><th>Detail</th></tr></thead><tbody>${factorsHtml}</tbody></table>
<div class="footer">BetTracker AI \u00B7 Generated ${new Date().toLocaleDateString()} \u00B7 Analysis is for informational purposes only</div>
</body></html>`
    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(html)
    win.document.close()
    win.focus()
    setTimeout(() => win.print(), 300)
  }, [analysis])

  // ── Share (copy to clipboard) ──────────────────────────────
  const [copied, setCopied] = useState(false)
  const handleShare = useCallback(async () => {
    if (!analysis) return
    const a = analysis
    const recLabels: Record<string, string> = { bet: '\u2705 BET', skip: '\u2715 SKIP', watch: '\uD83D\uDC41 WATCH', no_value: '\u274C NO VALUE' }
    const text = [
      `\uD83D\uDCCA AI Analysis \u2014 ${a.event_name}`,
      `${a.sport.toUpperCase()} \u00B7 ${a.market_type}${a.selection?' \u00B7 '+a.selection:''} \u00B7 @${a.offered_odds}`,
      ``,
      `Recommendation: ${recLabels[a.recommendation]??a.recommendation}`,
      `Model prob: ${a.model_probability.toFixed(1)}% | Implied: ${a.implied_probability.toFixed(1)}% | Edge: ${a.edge_percent>=0?'+':''}${a.edge_percent.toFixed(1)}%`,
      `Confidence: ${a.confidence_score}/100 | Risk: ${a.risk_level}`,
      ``,
      a.reasoning,
      a.disclaimer?`\n\u26A0\uFE0F ${a.disclaimer}`:'',
      ``,
      `via BetTracker AI`,
    ].filter(Boolean).join('\n')
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [analysis])

  const a = analysis

  return (
    <div className="max-w-2xl flex flex-col gap-6" onPaste={handlePaste}>
      <div>
        <h1 className="text-2xl font-bold text-white">AI Analyst</h1>
        <p className="text-sm text-gray-500 mt-1">Paste a coupon screenshot or fill in manually</p>
      </div>

      {/* ── Scanner zone ────────────────────────────────────── */}
      <div
        className={`border-2 border-dashed rounded-xl px-4 py-4 text-center cursor-pointer transition-colors ${
          scanning ? 'border-indigo-500 bg-indigo-950/30' : 'border-gray-700 hover:border-indigo-600 hover:bg-gray-800/40'
        }`}
        onClick={() => !scanning && fileRef.current?.click()}
      >
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
        {scanning ? (
          <div className="flex items-center justify-center gap-2 text-indigo-400 text-sm">
            <span className="animate-spin">\u23F3</span> {scanMsg}
          </div>
        ) : scanMsg ? (
          <div className="text-sm text-gray-300">{scanMsg}</div>
        ) : (
          <div>
            <div className="text-2xl mb-1">\uD83D\uDCF8</div>
            <p className="text-sm text-gray-400 font-medium">Paste screenshot (Ctrl+V) or click to upload</p>
            <p className="text-xs text-gray-600 mt-0.5">Auto-fills event, market, odds, sport</p>
          </div>
        )}
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
              placeholder="Bet365, Pinnacle\u2026"
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
              placeholder="Injuries, lineups, motivation, recent form, anything relevant\u2026"
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
              <span className="animate-spin">\u23F3</span> Analyzing\u2026
            </span>
          ) : '\uD83D\uDD0D Analyze'}
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

          {/* PDF + Share */}
          <div className="flex gap-2">
            <button
              onClick={downloadPDF}
              className="flex-1 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-medium transition-colors border border-gray-700 flex items-center justify-center gap-1.5"
            >
              \uD83D\uDCC4 Download PDF
            </button>
            <button
              onClick={handleShare}
              className="flex-1 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-sm font-medium transition-colors border border-gray-700 flex items-center justify-center gap-1.5"
              style={{ color: copied ? '#4ade80' : '#9ca3af' }}
            >
              {copied ? '\u2705 Copied!' : '\uD83D\uDD17 Copy to share'}
            </button>
          </div>

          {/* Actions */}
          {rootErr && (
            <div className="text-xs text-red-400 bg-red-950/40 border border-red-900 rounded-lg px-3 py-2">
              {rootErr}
            </div>
          )}

          {/* Stake input — shown when Place Bet is clicked */}
          {showStake && (
            <div className="flex gap-2 items-center">
              <input
                type="number"
                step="0.01"
                min="0.01"
                placeholder="Stake amount"
                className="input flex-1"
                value={stakeStr}
                onChange={e => { setStakeStr(e.target.value); setRootErr('') }}
                autoFocus
              />
              <button
                className="btn-primary px-5"
                onClick={() => handleAction('placed')}
                disabled={saving}
              >
                {saving ? '\u2026' : 'Confirm'}
              </button>
              <button
                className="px-3 py-2 rounded-lg bg-gray-800 text-gray-500 text-sm border border-gray-700"
                onClick={() => { setShowStake(false); setStakeStr(''); setRootErr('') }}
              >
                ✕
              </button>
            </div>
          )}

          <div className="flex gap-3">
            {!showStake && (
              <button
                className="btn-primary flex-1"
                onClick={() => {
                  if (analysis) {
                    trackClientEvent(EVENTS.DECISION_ACTION_PLACE_CLICKED, {
                      decision_id: analysis.decision_id,
                      odds_bucket: bucketOdds(analysis.offered_odds),
                      from_page: 'ai_page',
                    })
                  }
                  setShowStake(true)
                  setRootErr('')
                }}
                disabled={saving}
              >
                ✅ Place Bet
              </button>
            )}
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
