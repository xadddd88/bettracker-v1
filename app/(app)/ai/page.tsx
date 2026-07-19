'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { trackClientEvent } from '@/lib/analytics/client'
import { EVENTS } from '@/lib/analytics/events'
import { bucketOdds, bucketStake } from '@/lib/analytics/buckets'
import RiskEvaluator from '@/components/risk/RiskEvaluator'
import { Camera, Loader2, Eye, X, CheckCircle, Search } from 'lucide-react'
import {
  buildAnalystTrustView,
  localizeAnalystTrustSport,
  renderAnalystTrustShareText,
  renderPricingSummaryLine,
  shouldShowPricingStats,
  type AnalysisLegQualityInput,
  type AnalysisQualityGateResult,
  type AnalystTrustView,
} from '@/lib/ai/analysis-quality-gate'
import type { AnalystResearchBrief, AnalystResearchSource } from '@/lib/ai/analyst-research'

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
  model_probability:   number | null
  implied_probability: number | null
  edge_percent:        number | null
  confidence_score:    number
  risk_level:          RiskLevel
  recommendation:      Recommendation
  reasoning:           string
  factors:             Factor[]
  disclaimer:          string
  quality_gate?:       AnalysisQualityGateResult | null
  trust_view?:         AnalystTrustView | null
  research_brief?:     AnalystResearchBrief | null
  research_sources?:   AnalystResearchSource[]
  web_search_used?:    boolean
  // Input echoed back from server
  sport:           string
  event_name:      string
  market_type:     string
  selection:       string | null
  line:            number | null
  offered_odds:    number
  bookmaker:       string | null
  coupon_event_time?: string | null
  output_language: string
}

function escapeHtml(value: string | number | null | undefined): string {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[ch] ?? ch))
}

function getAnalysisTrustView(a: Analysis): AnalystTrustView | null {
  if (a.trust_view) return a.trust_view
  if (!a.quality_gate) return null
  return buildAnalystTrustView({
    qualityGate:  a.quality_gate,
    locale:       a.output_language,
    eventName:    a.event_name,
    marketType:   a.market_type,
    selection:    a.selection,
    rawReasoning: a.reasoning,
    rawFactors:   a.factors,
  })
}

function localizedRiskLabel(risk: RiskLevel, fallback: string, trustView: AnalystTrustView | null): string {
  if (trustView?.locale !== 'uk') return fallback
  if (risk === 'high') return 'Високий ризик'
  if (risk === 'medium') return 'Середній ризик'
  return 'Низький ризик'
}

function renderResearchBriefText(brief: AnalystResearchBrief, sources: AnalystResearchSource[] = []): string {
  const lines = [
    brief.headline,
    brief.summary,
    brief.builderRisk ? `\nBet Builder: ${brief.builderRisk}` : '',
    ...brief.legs.flatMap(leg => [
      `\n${leg.legNumber}. ${leg.eventName} — ${leg.marketType}${leg.selection ? ` / ${leg.selection}` : ''}`,
      leg.assessment,
      ...leg.evidence.map(item => `+ ${item}`),
      ...leg.risks.map(item => `− ${item}`),
    ]),
    `\nVerdict: ${brief.verdict}`,
    ...brief.dataGaps.map(item => `Unverified: ${item}`),
    ...sources.map(source => `Source: ${source.title} — ${source.url}`),
  ]
  return lines.filter(Boolean).join('\n')
}

// ─── Constants ────────────────────────────────────────────────
const SPORTS: { value: Sport; label: string }[] = [
  { value: 'soccer',     label: 'Football'   },
  { value: 'tennis',     label: 'Tennis'     },
  { value: 'cs2',        label: 'CS2'        },
  { value: 'basketball', label: 'Basketball' },
  { value: 'ice_hockey', label: 'Ice Hockey' },
  { value: 'mma',        label: 'MMA'        },
  { value: 'other',      label: 'Other'      },
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

  // Read Scout pre-fill params on mount
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const sid       = params.get('scout_id')
    const event     = params.get('event')
    const market    = params.get('market')
    const selection = params.get('selection')
    const sp        = params.get('sport') as Sport | null

    if (sid) setScoutId(sid)
    if (sp && SPORTS.map(s => s.value).includes(sp)) setSport(sp)
    if (event || market || selection) {
      setForm(f => ({
        ...f,
        event_name:  event      ?? f.event_name,
        market_type: market     ?? f.market_type,
        selection:   selection  ?? f.selection,
      }))
    }
  }, [])

  const [scoutId,    setScoutId]    = useState<string | null>(null)
  const [sport,      setSport]      = useState<Sport>('soccer')
  const [locale,     setLocale]     = useState<Locale>('auto')
  const [form,       setForm]       = useState({ event_name: '', market_type: '', selection: '', line: '', odds: '', bookmaker: '', event_time: '', notes: '' })
  const [errors,     setErrors]     = useState<Record<string, string>>({})
  const [analysis,   setAnalysis]   = useState<Analysis | null>(null)
  const [analyzing,  setAnalyzing]  = useState(false)
  const [saving,     setSaving]     = useState(false)
  const [rootErr,    setRootErr]    = useState('')
  const [scanning,   setScanning]   = useState(false)
  const [scanMsg,    setScanMsg]    = useState('')
  const [stakeStr,   setStakeStr]   = useState('')
  const [showStake,  setShowStake]  = useState(false)
  const [showRisk,   setShowRisk]   = useState(false)
  const [couponLegs, setCouponLegs] = useState<AnalysisLegQualityInput[] | null>(null)

  function setField(k: string, v: string) {
    setForm(f => ({ ...f, [k]: v }))
    setErrors(e => ({ ...e, [k]: '' }))
    if (['event_name', 'market_type', 'selection', 'odds'].includes(k)) setCouponLegs(null)
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
        event_time:  d.event_start_text ?? prev.event_time,
      }))
      setCouponLegs(Array.isArray(d.legs) && d.legs.length > 0 ? d.legs : null)
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
    setShowRisk(false)
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
          coupon_event_time: form.event_time.trim() || undefined,
          client_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          notes:           form.notes.trim() || undefined,
          output_language: locale,
          legs:            couponLegs ?? undefined,
        }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        setRootErr(json.error ?? 'Analysis failed. Try again.')
        return
      }
      setAnalysis(json.data)
      // If opened from Scout, update opportunity status fire-and-forget
      if (scoutId) {
        fetch(`/api/scout/${scoutId}`, {
          method:  'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            status:             'converted_to_decision',
            linked_decision_id: json.data.decision_id,
          }),
        }).catch(() => {})
      }
    } catch {
      setRootErr('Network error \u2014 please try again.')
    } finally {
      setAnalyzing(false)
    }
  }, [sport, locale, form, scoutId, couponLegs])

  // ── Act on already-persisted decision ─────────────────────
  // Decision is created immediately by /api/ai/analyst.
  // handleAction only calls the 2nd RPC (place or mark).
  const handleAction = useCallback(async (action: 'placed' | 'skipped' | 'watchlisted') => {
    if (!analysis) return
    if (!analysis.decision_id) {
      setRootErr('Decision ID missing \u2014 please re-analyze (restart dev server if in development)')
      return
    }

    if (action === 'placed') {
      const stake = parseFloat(stakeStr)
      if (!stakeStr || isNaN(stake) || stake <= 0) {
        setRootErr('Enter a valid stake amount')
        return
      }
      setSaving(true)
      setRootErr('')
      trackClientEvent(EVENTS.BET_PLACE_CLICKED, {
        decision_id:  analysis.decision_id,
        from_page:    'ai_page',
        stake_bucket: bucketStake(stake),
        odds_bucket:  bucketOdds(analysis.offered_odds),
        is_ai_linked: true,
      })
      try {
        const { data: betData, error: betErr } = await supabase.rpc('place_bet_from_decision', {
          p_decision_id: analysis.decision_id,
          p_stake:       stake,
          p_bookmaker:   analysis.bookmaker,
        })
        if (betErr) {
          const isDuplicate = betErr.code === '23505' || betErr.message?.includes('duplicate') || betErr.message?.includes('already placed')
          if (isDuplicate) {
            trackClientEvent(EVENTS.BET_DUPLICATE_REJECTED, { decision_id: analysis.decision_id, from_page: 'ai_page' })
          } else {
            trackClientEvent(EVENTS.BET_PLACE_FAILED, { decision_id: analysis.decision_id, from_page: 'ai_page' })
          }
          throw new Error(betErr.message || betErr.details || JSON.stringify(betErr))
        }
        const betPayload = betData as { bet_id?: string } | null
        trackClientEvent(EVENTS.BET_PLACE_SUCCEEDED, {
          bet_id:      betPayload?.bet_id,
          decision_id: analysis.decision_id,
          sport:       analysis.sport,
          bet_type:    'single',
          source:      'ai_page',
          stake_bucket: bucketStake(stake),
          odds_bucket:  bucketOdds(analysis.offered_odds),
          is_ai_linked: true,
          is_parlay:    false,
          legs_count:   1,
        })
        trackClientEvent(EVENTS.DECISION_ACTION_PLACED, { decision_id: analysis.decision_id, from_page: 'ai_page' })
        router.push(`/decisions/${analysis.decision_id}`)
      } catch (err: unknown) {
        trackClientEvent(EVENTS.DECISION_ACTION_FAILED, { decision_id: analysis.decision_id, action: 'placed', from_page: 'ai_page' })
        setRootErr(err instanceof Error ? err.message : String(err))
        setShowRisk(false)
      } finally {
        setSaving(false)
      }
      return
    }

    // Watch or Skip — fire event only after RPC succeeds
    setSaving(true)
    setRootErr('')
    try {
      const { error: actionErr } = await supabase.rpc('update_decision_action', {
        p_decision_id:  analysis.decision_id,
        p_final_action: action,
      })
      if (actionErr) throw new Error(actionErr.message || actionErr.details || JSON.stringify(actionErr))
      if (action === 'watchlisted') {
        trackClientEvent(EVENTS.DECISION_ACTION_WATCH, { decision_id: analysis.decision_id, from_page: 'ai_page' })
      } else {
        trackClientEvent(EVENTS.DECISION_ACTION_SKIP, { decision_id: analysis.decision_id, from_page: 'ai_page' })
      }
      router.push(`/decisions/${analysis.decision_id}`)
    } catch (err: unknown) {
      trackClientEvent(EVENTS.DECISION_ACTION_FAILED, { decision_id: analysis.decision_id, action, from_page: 'ai_page' })
      setRootErr(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }, [analysis, stakeStr, supabase, router])

  // ── PDF download ───────────────────────────────────────────
  const downloadPDF = useCallback(() => {
    if (!analysis) return
    const a = analysis
    const trustView = getAnalysisTrustView(a)
    const recLabels: Record<string, string> = { bet: 'BET', skip: 'SKIP', watch: 'WATCH', no_value: 'NO VALUE' }
    const showPricing = shouldShowPricingStats({
      qualityGate:        a.quality_gate,
      modelProbability:   a.model_probability,
      impliedProbability: a.implied_probability,
      edgePercent:        a.edge_percent,
    })
    const gateChecklistHtml = trustView?.legs.map(leg =>
      `<li><strong>${escapeHtml(leg.legLabel)} (${escapeHtml(leg.sportLabel)})</strong><ul>${
        [
          leg.eventName,
          leg.periodOrPhase ? `${trustView?.locale === 'uk' ? 'Період / фаза' : 'Period / phase'}: ${leg.periodOrPhase}` : null,
          leg.statusSourceLabel ? `${trustView?.locale === 'uk' ? 'Джерело статусу' : 'Status source'}: ${leg.statusSourceLabel}` : null,
          leg.odds != null ? `${trustView?.locale === 'uk' ? 'Коефіцієнт' : 'Odds'}: ${leg.odds}` : null,
          `${leg.fixtureStatusLabel} · ${leg.supportLabel} · ${leg.actionabilityLabel}`,
          ...leg.missingData,
        ].filter(Boolean).map(item => `<li>${escapeHtml(item)}</li>`).join('')
      }</ul></li>`
    ).join('') ?? ''
    const researchHtml = a.research_brief ? `<section class="research">
  <div class="research-kicker">${a.web_search_used ? 'CURRENT-SOURCE RESEARCH' : 'COUPON INTELLIGENCE'}</div>
  <h2>${escapeHtml(a.research_brief.headline)}</h2>
  <p>${escapeHtml(a.research_brief.summary)}</p>
  ${a.research_brief.builderRisk ? `<div class="builder"><strong>Bet Builder correlation</strong><br>${escapeHtml(a.research_brief.builderRisk)}</div>` : ''}
  ${a.research_brief.legs.map(leg => `<div class="research-leg">
    <strong>${leg.legNumber}. ${escapeHtml(leg.eventName)}</strong>
    <div>${escapeHtml(leg.marketType)}${leg.selection ? ` · ${escapeHtml(leg.selection)}` : ''}</div>
    <p>${escapeHtml(leg.assessment)}</p>
    ${leg.evidence.length ? `<ul>${leg.evidence.map(item => `<li>+ ${escapeHtml(item)}</li>`).join('')}</ul>` : ''}
    ${leg.risks.length ? `<ul>${leg.risks.map(item => `<li>− ${escapeHtml(item)}</li>`).join('')}</ul>` : ''}
  </div>`).join('')}
  <div class="verdict"><strong>Verdict</strong><br>${escapeHtml(a.research_brief.verdict)}</div>
  ${a.research_sources?.length ? `<div class="sources"><strong>Sources</strong><ul>${a.research_sources.map(source => `<li>${escapeHtml(source.title)} — ${escapeHtml(source.url)}</li>`).join('')}</ul></div>` : ''}
</section>` : ''
    const pricingHtml = showPricing
      ? `<div class="grid">
  <div class="stat"><div class="stat-label">Model probability</div><div class="stat-value">${a.model_probability?.toFixed(1)}%</div></div>
  <div class="stat"><div class="stat-label">Implied probability</div><div class="stat-value">${a.implied_probability?.toFixed(1)}%</div></div>
  <div class="stat"><div class="stat-label">Edge</div><div class="stat-value" style="color:${(a.edge_percent ?? 0)>=0?'#16a34a':'#dc2626'}">${(a.edge_percent ?? 0)>=0?'+':''}${a.edge_percent?.toFixed(1)}%</div></div>
</div>`
      : `<div class="quality-gate">
  <div class="gate-kicker">${escapeHtml(trustView?.riskWarningLabel ?? 'Risk warning')}</div>
  <div class="gate-label">${escapeHtml(trustView?.label ?? a.quality_gate?.label ?? 'INSUFFICIENT DATA')}</div>
  <div class="gate-support">${escapeHtml(trustView?.supportLabel ?? a.quality_gate?.supportLabel ?? 'Unsupported / partially supported bet')}</div>
  <div class="gate-score">${escapeHtml(trustView?.dataCoverageLabel ?? 'Data coverage')}: ${trustView?.dataCoverageScore ?? a.quality_gate?.dataCoverageScore ?? 0}/100</div>
  ${trustView?.safeExplanation ? `<div class="gate-support">${escapeHtml(trustView.safeExplanation)}</div>` : ''}
  ${gateChecklistHtml ? `<div class="gate-missing-title">${escapeHtml(trustView?.missingDataChecklistLabel ?? 'Missing data checklist')}</div><ul class="gate-missing">${gateChecklistHtml}</ul>` : ''}
</div>`
    const displayFactors = trustView && !showPricing ? trustView.displayFactors : a.factors
    const factorsHtml = displayFactors.map(f =>
      `<tr><td>${escapeHtml(f.name)}</td><td style="text-align:center;font-weight:bold;color:${f.score>0?'#22c55e':f.score<0?'#ef4444':'#9ca3af'}">${f.score>0?'+':''}${f.score}</td><td style="color:#9ca3af;font-size:12px">${escapeHtml(f.detail)}</td></tr>`
    ).join('')
    const blockedTrustView = trustView && !showPricing ? trustView : null
    const localizedPdf = blockedTrustView?.locale === 'uk'
    const pdfTitle = blockedTrustView ? blockedTrustView.pdfHeader : 'AI Analysis'
    const factorHeader = localizedPdf ? 'Фактор' : 'Factor'
    const scoreHeader = localizedPdf ? 'Бал' : 'Score'
    const detailHeader = localizedPdf ? 'Деталі' : 'Detail'
    const generatedLabel = blockedTrustView ? blockedTrustView.generatedLabel : 'Generated'
    const footerLabel = blockedTrustView ? blockedTrustView.pdfFooter : 'Analysis is for informational purposes only'
    const metaSport = blockedTrustView ? localizeAnalystTrustSport(a.sport, blockedTrustView.locale) : a.sport.toUpperCase()
    const disclaimerText = blockedTrustView ? blockedTrustView.uiDisclaimer : a.disclaimer
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(pdfTitle)} \u2014 ${escapeHtml(a.event_name)}</title>
<style>
  body{font-family:system-ui,sans-serif;max-width:700px;margin:40px auto;padding:20px;color:#111;background:#fff}
  h1{font-size:22px;margin-bottom:4px}
  .meta{color:#666;font-size:13px;margin-bottom:20px}
  .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:16px 0}
  .stat{background:#f8f8f8;padding:12px;border-radius:8px;text-align:center}
  .stat-label{font-size:11px;color:#888;margin-bottom:4px}
  .stat-value{font-size:22px;font-weight:700}
  .quality-gate{background:#fff7ed;border:1px solid #fed7aa;padding:14px;border-radius:8px;margin:16px 0}
  .research{border:1px solid #111;padding:16px;margin:16px 0}
  .research h2{font-size:20px;margin:8px 0}
  .research-kicker{font-size:10px;font-weight:800;letter-spacing:.08em}
  .builder{background:#e8ff00;border:1px solid #111;padding:10px;margin:12px 0}
  .research-leg{border-top:1px solid #111;padding:12px 0}
  .research-leg p,.research-leg li,.sources li{font-size:12px;line-height:1.5}
  .verdict{border-top:1px solid #111;padding-top:12px}
  .gate-kicker{font-size:11px;color:#9a3412;text-transform:uppercase;font-weight:700;letter-spacing:.04em}
  .gate-label{font-size:18px;font-weight:800;color:#9a3412;margin-top:4px}
  .gate-support,.gate-score{font-size:12px;color:#7c2d12;margin-top:4px}
  .gate-missing-title{font-size:12px;font-weight:700;color:#7c2d12;margin-top:10px}
  .gate-missing{font-size:12px;color:#7c2d12;margin-top:4px;padding-left:18px}
  .rec{display:inline-block;padding:4px 12px;border-radius:6px;font-weight:700;font-size:14px;background:#f0f0f0;margin-bottom:12px}
  .reasoning{background:#f8f8f8;padding:14px;border-radius:8px;margin:12px 0;line-height:1.6}
  table{width:100%;border-collapse:collapse;margin-top:12px}
  th{text-align:left;font-size:12px;color:#888;padding:6px 8px;border-bottom:1px solid #eee}
  td{padding:7px 8px;border-bottom:1px solid #f0f0f0;font-size:13px;vertical-align:top}
  .disclaimer{font-size:11px;color:#999;margin-top:16px;padding-top:12px;border-top:1px solid #eee}
  .footer{margin-top:24px;font-size:11px;color:#bbb;text-align:center}
  @media print{body{margin:20px}}
</style></head><body>
<h1>${escapeHtml(a.event_name)}</h1>
<div class="meta">${escapeHtml(metaSport)} \u00B7 ${escapeHtml(a.market_type)}${a.selection?' \u00B7 '+escapeHtml(a.selection):''} \u00B7 @${a.offered_odds}${a.bookmaker?' \u00B7 '+escapeHtml(a.bookmaker):''}</div>
<div class="rec">${escapeHtml(showPricing ? recLabels[a.recommendation]??a.recommendation : trustView?.label ?? recLabels[a.recommendation]??a.recommendation)}</div>
${researchHtml}
${pricingHtml}
<div class="reasoning">${escapeHtml(trustView && !showPricing ? trustView.displayReasoning : a.reasoning)}</div>
${disclaimerText?`<div class="disclaimer">${escapeHtml(disclaimerText)}</div>`:''}
<h3 style="margin-top:20px;font-size:14px">${escapeHtml(trustView?.factorAnalysisLabel ?? 'Factor Analysis')}</h3>
<table><thead><tr><th>${escapeHtml(factorHeader)}</th><th>${escapeHtml(scoreHeader)}</th><th>${escapeHtml(detailHeader)}</th></tr></thead><tbody>${factorsHtml}</tbody></table>
<div class="footer">BetTracker AI \u00B7 ${escapeHtml(generatedLabel)} ${new Date().toLocaleDateString()} \u00B7 ${escapeHtml(footerLabel)}</div>
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
    const trustView = getAnalysisTrustView(a)
    const recLabels: Record<string, string> = { bet: '\u2705 BET', skip: '\u2715 SKIP', watch: '\uD83D\uDC41 WATCH', no_value: '\u274C NO VALUE' }
    const showPricing = shouldShowPricingStats({
      qualityGate:        a.quality_gate,
      modelProbability:   a.model_probability,
      impliedProbability: a.implied_probability,
      edgePercent:        a.edge_percent,
    })
    const trustText = trustView && !showPricing
      ? renderAnalystTrustShareText(trustView, {
        eventName:   a.event_name,
        sport:       a.sport,
        marketType:  a.market_type,
        selection:   a.selection,
        offeredOdds: a.offered_odds,
        bookmaker:   a.bookmaker,
      })
      : [
        `\uD83D\uDCCA AI Analysis \u2014 ${a.event_name}`,
        `${a.sport.toUpperCase()} \u00B7 ${a.market_type}${a.selection?' \u00B7 '+a.selection:''} \u00B7 @${a.offered_odds}`,
        ``,
        `Recommendation: ${recLabels[a.recommendation]??a.recommendation}`,
        renderPricingSummaryLine({
          qualityGate:        a.quality_gate,
          modelProbability:   a.model_probability,
          impliedProbability: a.implied_probability,
          edgePercent:        a.edge_percent,
        }),
        `${trustView?.confidenceLabel ?? 'Confidence'}: ${a.confidence_score}/100 | Risk: ${a.risk_level}`,
        ``,
        a.reasoning,
        a.disclaimer?`\n\u26A0\uFE0F ${a.disclaimer}`:'',
        ``,
        `via BetTracker AI`,
      ].filter(Boolean).join('\n')
    const text = a.research_brief
      ? `${renderResearchBriefText(a.research_brief, a.research_sources)}\n\n${trustText}`
      : trustText
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [analysis])

  const a = analysis
  const trustView = a ? getAnalysisTrustView(a) : null
  const pricingVisible = a ? shouldShowPricingStats({
    qualityGate:        a.quality_gate,
    modelProbability:   a.model_probability,
    impliedProbability: a.implied_probability,
    edgePercent:        a.edge_percent,
  }) : false

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6" onPaste={handlePaste}>
      <section className="editorial-dark relative min-h-[340px] overflow-hidden border border-black p-5 md:p-8">
        <div className="pointer-events-none absolute -right-4 top-2 select-none font-display text-[clamp(7rem,20vw,13rem)] font-black leading-none tracking-[-0.1em] text-white/[0.055]" aria-hidden>
          SCAN
        </div>
        <div className="relative z-10 flex min-h-[290px] flex-col">
          <div className="flex justify-between font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-white">
            <span>AI / Scanner</span>
            <span>Image to decision</span>
          </div>
          <div className="my-auto py-8">
            <p className="font-mono text-[9px] font-black uppercase tracking-[0.2em] text-[#e8ff00]">Capture stage</p>
            <h1 className="mt-4 max-w-3xl font-display text-[clamp(3rem,8vw,6.8rem)] font-black uppercase leading-[0.8] tracking-[-0.075em] text-white">
              Analyze from<br />a screenshot
            </h1>
            <p className="mt-6 max-w-xl text-sm leading-6 text-white/60">Upload or paste a coupon, verify every extracted field, then run the supported analysis.</p>
          </div>
        </div>
      </section>

      {/* ── Scout pre-fill indicator ───────────────────────── */}
      {scoutId && !analysis && (
        <div className="text-xs text-indigo-400 bg-indigo-950/30 border border-indigo-900 rounded-lg px-3 py-2 flex items-center gap-2">
          <Search size={12} strokeWidth={2} />
          Pre-filled from Scout — enter current odds to analyse
        </div>
      )}

      {/* ── Scanner zone ────────────────────────────────────── */}
      <div
        className={`group cursor-pointer border border-black px-5 py-8 text-center transition-colors ${
          scanning ? 'bg-[#e8ff00]' : 'bg-white hover:bg-[#e8ff00]'
        }`}
        onClick={() => !scanning && fileRef.current?.click()}
      >
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
        {scanning ? (
          <div className="flex items-center justify-center gap-2 text-sm font-bold text-black">
            <Loader2 size={14} className="animate-spin" /> {scanMsg}
          </div>
        ) : scanMsg ? (
          <div className="text-sm font-bold text-black">{scanMsg}</div>
        ) : (
          <div>
            <div className="mb-3 flex justify-center"><Camera size={28} strokeWidth={1.5} /></div>
            <p className="font-display text-xl font-black uppercase tracking-[-0.04em]">Choose screenshot</p>
            <p className="mt-2 font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-black/50">Paste, camera export or photo library</p>
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
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Form ────────────────────────────────────────────── */}
      <div className="card flex flex-col gap-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
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
              type="number" step="0.01" min="1.01" placeholder={scoutId ? 'Enter current odds' : '1.85'}
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

          <div className="sm:col-span-2">
            <label className="label">Coupon date / time</label>
            <input
              className="input"
              placeholder="Today, 22:10 / 19.07.2026, 22:10"
              value={form.event_time}
              onChange={e => setField('event_time', e.target.value)}
            />
            <p className="mt-1 text-[10px] text-gray-500">Keep the exact text from the coupon so the Analyst can identify the fixture.</p>
          </div>

          <div className="sm:col-span-2">
            <label className="label">Context / Notes</label>
            <textarea
              className="input resize-none" rows={2}
              placeholder="Injuries, lineups, motivation, recent form, anything relevant…"
              value={form.notes}
              onChange={e => setField('notes', e.target.value)}
            />
          </div>
        </div>

        {couponLegs && couponLegs.length > 0 && (
          <section className="border border-black bg-[#f4f3ed]" aria-labelledby="coupon-legs-heading">
            <div className="flex items-center justify-between border-b border-black px-4 py-3">
              <h2 id="coupon-legs-heading" className="font-mono text-[10px] font-black uppercase tracking-[0.16em] text-black">
                Extracted coupon legs
              </h2>
              <span className="bg-black px-2 py-1 font-mono text-[9px] font-black text-white">{couponLegs.length}</span>
            </div>
            <div className="divide-y divide-black/25">
              {couponLegs.map((leg, index) => (
                <article key={`${leg.eventName ?? 'leg'}-${index}`} className="grid gap-2 px-4 py-4 sm:grid-cols-[44px_1fr_auto]">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full border border-black font-mono text-xs font-black text-black">
                    {String(index + 1).padStart(2, '0')}
                  </div>
                  <div className="min-w-0">
                    <p className="font-display text-base font-black text-black">{leg.eventName || form.event_name}</p>
                    <p className="mt-1 text-sm text-black/65">
                      {leg.marketType || form.market_type}{leg.selection ? ` · ${leg.selection}` : ''}
                    </p>
                  </div>
                  <div className="font-mono text-sm font-black text-black">
                    {leg.odds != null ? Number(leg.odds).toFixed(2) : '—'}
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        {rootErr && !analysis && (
          <div className="text-xs text-red-400 bg-red-950/40 border border-red-900 rounded-lg px-3 py-2">
            {rootErr}
          </div>
        )}

        <button
          className="btn-primary flex items-center justify-center gap-2"
          onClick={handleAnalyze}
          disabled={analyzing}
        >
          {analyzing ? (
            <><Loader2 size={14} className="animate-spin" /> Analyzing…</>
          ) : (
            <><Search size={14} strokeWidth={2} /> Analyze</>
          )}
        </button>
      </div>

      {/* ── Analysis result ─────────────────────────────────── */}
      {a && (
        <div className="flex flex-col gap-4">
          {a.research_brief && (
            <section className="border border-black bg-white text-black" aria-labelledby="research-brief-heading">
              <div className="border-b border-black bg-black px-5 py-4 text-white">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="font-mono text-[9px] font-black uppercase tracking-[0.18em] text-[#e8ff00]">
                    {a.web_search_used ? 'Current-source research' : 'Coupon intelligence'}
                  </p>
                  <span className="border border-white/40 px-2 py-1 font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-white">
                    {a.research_brief.legs.length} {a.research_brief.legs.length === 1 ? 'leg' : 'legs'}
                  </span>
                </div>
                <h2 id="research-brief-heading" className="mt-4 max-w-3xl font-display text-3xl font-black leading-[0.95] tracking-[-0.045em] text-white md:text-5xl">
                  {a.research_brief.headline}
                </h2>
                <p className="mt-4 max-w-3xl text-sm leading-6 text-white/75">{a.research_brief.summary}</p>
              </div>

              {a.research_brief.builderRisk && (
                <div className="border-b border-black bg-[#e8ff00] px-5 py-4">
                  <p className="font-mono text-[9px] font-black uppercase tracking-[0.16em] text-black">Bet Builder correlation</p>
                  <p className="mt-2 text-sm font-semibold leading-6 text-black">{a.research_brief.builderRisk}</p>
                </div>
              )}

              <div className="divide-y divide-black">
                {a.research_brief.legs.map(leg => (
                  <article key={`${leg.legNumber}-${leg.eventName}-${leg.marketType}`} className="grid gap-4 px-5 py-5 md:grid-cols-[54px_1fr]">
                    <div className="flex h-11 w-11 items-center justify-center rounded-full border border-black font-mono text-xs font-black">
                      {String(leg.legNumber).padStart(2, '0')}
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <h3 className="font-display text-xl font-black tracking-[-0.025em]">{leg.eventName}</h3>
                          <p className="mt-1 text-sm text-black/60">{leg.marketType}{leg.selection ? ` · ${leg.selection}` : ''}</p>
                        </div>
                        <span className="border border-black px-2 py-1 font-mono text-[9px] font-black uppercase tracking-[0.1em]">
                          {leg.fixtureStatus.replaceAll('_', ' ')}
                        </span>
                      </div>
                      <p className="mt-4 text-sm font-semibold leading-6">{leg.assessment}</p>

                      <div className="mt-4 grid gap-4 md:grid-cols-2">
                        <div>
                          <p className="font-mono text-[9px] font-black uppercase tracking-[0.14em] text-black/50">Evidence / logic</p>
                          <ul className="mt-2 space-y-1.5 text-sm leading-5 text-black/75">
                            {leg.evidence.length > 0
                              ? leg.evidence.map((item, itemIndex) => <li key={`${itemIndex}-${item}`}>+ {item}</li>)
                              : <li>+ No verified current evidence returned.</li>}
                          </ul>
                        </div>
                        <div>
                          <p className="font-mono text-[9px] font-black uppercase tracking-[0.14em] text-black/50">Failure modes</p>
                          <ul className="mt-2 space-y-1.5 text-sm leading-5 text-black/75">
                            {leg.risks.map((item, itemIndex) => <li key={`${itemIndex}-${item}`}>− {item}</li>)}
                          </ul>
                        </div>
                      </div>
                    </div>
                  </article>
                ))}
              </div>

              <div className="border-t border-black px-5 py-5">
                <p className="font-mono text-[9px] font-black uppercase tracking-[0.16em] text-black/50">Analyst verdict</p>
                <p className="mt-2 text-base font-bold leading-6">{a.research_brief.verdict}</p>
                {a.research_brief.dataGaps.length > 0 && (
                  <div className="mt-4 border-l-4 border-black pl-4">
                    <p className="font-mono text-[9px] font-black uppercase tracking-[0.14em] text-black/50">Still unverified</p>
                    <ul className="mt-2 space-y-1 text-sm text-black/70">
                      {a.research_brief.dataGaps.map((item, itemIndex) => <li key={`${itemIndex}-${item}`}>— {item}</li>)}
                    </ul>
                  </div>
                )}
              </div>

              {a.research_sources && a.research_sources.length > 0 && (
                <div className="border-t border-black bg-[#f4f3ed] px-5 py-5">
                  <p className="font-mono text-[9px] font-black uppercase tracking-[0.16em] text-black/50">Sources consulted</p>
                  <div className="mt-3 grid gap-2 md:grid-cols-2">
                    {a.research_sources.map(source => (
                      <a
                        key={source.url}
                        href={source.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="border border-black bg-white px-3 py-3 text-sm font-bold text-black underline decoration-1 underline-offset-4 hover:bg-[#e8ff00]"
                      >
                        {source.title}
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </section>
          )}

          {/* Recommendation header */}
          {(() => {
            const rec = REC_CONFIG[a.recommendation]
            const risk = RISK_CONFIG[a.risk_level]
            const gate = a.quality_gate ?? null
            const trust = trustView
            const showPricing = shouldShowPricingStats({
              qualityGate:        gate,
              modelProbability:   a.model_probability,
              impliedProbability: a.implied_probability,
              edgePercent:        a.edge_percent,
            })
            const recDetail: Record<Recommendation, string> = {
              bet:      'Edge detected — AI sees value at these odds.',
              watch:    'Uncertain — monitor for odds movement or new info.',
              skip:     'No meaningful edge found at current odds.',
              no_value: 'AI does not recommend this market.',
            }
            const disclaimerText = trust && !showPricing ? trust.uiDisclaimer : a.disclaimer
            const researchedNoPriceLabel = trust?.locale === 'uk' ? 'ЦІНУ НЕ ПІДТВЕРДЖЕНО' : 'PRICE NOT VERIFIED'
            const researchedNoPriceSupport = trust?.locale === 'uk'
              ? 'Якісний розбір наведено вище; точну ймовірність та EV приховано.'
              : 'Qualitative research is shown above; probability and EV remain withheld.'
            return (
              <div className={`card border ${rec.bg} flex flex-col gap-3`}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className={`text-lg font-bold ${showPricing ? rec.color : 'text-amber-300'}`}>
                      {showPricing ? rec.label : a.research_brief ? researchedNoPriceLabel : trust?.label ?? gate?.label ?? 'INSUFFICIENT DATA'}
                    </span>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {showPricing ? recDetail[a.recommendation] : a.research_brief ? researchedNoPriceSupport : trust?.supportLabel ?? gate?.supportLabel ?? 'Unsupported / partially supported bet'}
                    </p>
                  </div>
                  {showPricing ? (
                  <div className="text-right shrink-0">
                    <span className={`text-xs font-medium ${risk.color}`}>{risk.label}</span>
                    <p className="text-[10px] text-gray-600 mt-0.5">edge · confidence · market</p>
                  </div>
                  ) : (
                    <div className="text-right shrink-0">
                      <span className={`text-xs font-medium ${risk.color}`}>{localizedRiskLabel(a.risk_level, risk.label, trust)}</span>
                      <p className="text-[10px] text-gray-600 mt-0.5">{trust ? `${trust.riskWarningLabel} / ${trust.dataCoverageLabel}` : 'risk warning / data coverage'}</p>
                    </div>
                  )}
                </div>

                {/* Probabilities */}
                {showPricing ? (
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div>
                    <div className="text-xs text-gray-500 mb-0.5">Model prob.</div>
                    <div className="text-xl font-bold text-white">{a.model_probability?.toFixed(1)}%</div>
                    <div className="text-[10px] text-gray-600 mt-0.5">AI win estimate</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 mb-0.5">Implied</div>
                    <div className="text-xl font-bold text-gray-300">{a.implied_probability?.toFixed(1)}%</div>
                    <div className="text-[10px] text-gray-600 mt-0.5">From your odds</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 mb-0.5">Edge</div>
                    <div className={`text-xl font-bold ${(a.edge_percent ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {(a.edge_percent ?? 0) >= 0 ? '+' : ''}{a.edge_percent?.toFixed(1)}%
                    </div>
                    <div className="text-[10px] text-gray-600 mt-0.5">Model minus implied</div>
                  </div>
                </div>
                ) : gate && (
                  <div className="rounded-lg border border-amber-900/70 bg-amber-950/25 px-3 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-wide text-amber-300">{trust?.riskWarningLabel ?? 'Risk warning'}</div>
                        <div className="text-sm text-amber-100 mt-0.5">{trust?.supportLabel ?? gate.supportLabel}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-amber-400">{trust?.dataCoverageLabel ?? 'Data coverage'}</div>
                        <div className="text-lg font-bold text-amber-100">{gate.dataCoverageScore}/100</div>
                      </div>
                    </div>
                    {trust?.safeExplanation && (
                      <p className="text-xs text-amber-100/90 mt-3">{trust.safeExplanation}</p>
                    )}
                    {trust && trust.legs.length > 0 ? (
                      <div className="mt-3">
                        <div className="text-xs font-medium text-amber-300 mb-1">{trust.missingDataChecklistLabel}</div>
                        <div className="flex flex-col gap-2">
                          {trust.legs.map(leg => (
                            <div key={`${leg.legLabel}-${leg.sport}-${leg.legNumber}`} className="text-xs text-amber-100/90 rounded border border-amber-900/40 px-2 py-2">
                              <div className="font-medium">{leg.legLabel} / {leg.sportLabel}</div>
                              <div className="text-amber-100/75 mt-0.5">{leg.eventName}</div>
                              <div className="text-amber-100/75">{leg.marketType}{leg.selection ? ` / ${leg.selection}` : ''}</div>
                              {leg.periodOrPhase && (
                                <div className="text-amber-100/75">{trust.locale === 'uk' ? 'Період / фаза' : 'Period / phase'}: {leg.periodOrPhase}</div>
                              )}
                              {leg.statusSourceLabel && (
                                <div className="text-amber-100/75">{trust.locale === 'uk' ? 'Джерело статусу' : 'Status source'}: {leg.statusSourceLabel}</div>
                              )}
                              {leg.odds != null && (
                                <div className="text-amber-100/75">{trust.locale === 'uk' ? 'Коефіцієнт' : 'Odds'}: {leg.odds}</div>
                              )}
                              <div className="mt-1 text-amber-200/80">{leg.fixtureStatusLabel} · {leg.supportLabel} · {leg.actionabilityLabel}</div>
                              <ul className="list-disc pl-4 mt-0.5 text-amber-200/80">
                                {leg.missingData.map(item => <li key={item}>{item}</li>)}
                              </ul>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                )}

                {/* Confidence */}
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-gray-500">{trust?.confidenceLabel ?? 'Confidence'}</span>
                    <span className="text-gray-300">{a.confidence_score}/100</span>
                  </div>
                  <div className="bg-gray-800 rounded-full h-1.5">
                    <div
                      className="h-1.5 rounded-full bg-indigo-500 transition-all"
                      style={{ width: `${a.confidence_score}%` }}
                    />
                  </div>
                  <div className="text-[10px] text-gray-600 mt-1">
                    {trust?.locale === 'uk'
                      ? 'Обережна впевненість без розрахунку ціни'
                      : 'How certain the model is in its estimate'}
                  </div>
                </div>

                {/* Reasoning */}
                <p className="text-sm text-gray-300 leading-relaxed">{trust && !showPricing ? trust.displayReasoning : a.reasoning}</p>

                {/* Disclaimer */}
                {disclaimerText && (
                  <p className="text-xs text-gray-500 border-t border-gray-700 pt-2 mt-1">{disclaimerText}</p>
                )}
              </div>
            )
          })()}

          {/* Factors */}
          <div className="card flex flex-col gap-2">
            <h3 className="text-sm font-semibold text-gray-300 mb-1">
              {a.research_brief && !pricingVisible
                ? (trustView?.locale === 'uk' ? 'Перевірка ціни' : 'Pricing verification')
                : trustView?.factorAnalysisLabel ?? 'Factor Analysis'}
            </h3>
            {(trustView && !pricingVisible ? trustView.displayFactors : a.factors).map((f, i) => (
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
              \uD83D\uDCC4 {trustView?.downloadPdfLabel ?? 'Download PDF'}
            </button>
            <button
              onClick={handleShare}
              className="flex-1 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-sm font-medium transition-colors border border-gray-700 flex items-center justify-center gap-1.5"
              style={{ color: copied ? '#4ade80' : '#9ca3af' }}
            >
              {copied ? `\u2705 ${trustView?.copiedLabel ?? 'Copied!'}` : `\uD83D\uDD17 ${trustView?.copyToShareLabel ?? 'Copy to share'}`}
            </button>
          </div>

          {/* Actions */}
          {rootErr && (
            <div className="text-xs text-red-400 bg-red-950/40 border border-red-900 rounded-lg px-3 py-2">
              {rootErr}
            </div>
          )}

          {/* Risk evaluator — shown after stake is entered */}
          {showStake && showRisk && analysis && (
            <RiskEvaluator
              stake={parseFloat(stakeStr)}
              decisionId={analysis.decision_id}
              fromPage="ai_page"
              onConfirm={() => handleAction('placed')}
              onAdjustStake={() => { setShowRisk(false); setRootErr('') }}
            />
          )}

          {/* Stake input — shown when Place Bet is clicked */}
          {showStake && !showRisk && (
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
                onClick={() => {
                  const s = parseFloat(stakeStr)
                  if (!stakeStr || isNaN(s) || s <= 0) { setRootErr('Enter a valid stake amount'); return }
                  setRootErr('')
                  setShowRisk(true)
                }}
                disabled={saving}
              >
                Check Risk
              </button>
              <button
                className="px-3 py-2 rounded-lg bg-gray-800 text-gray-500 text-sm border border-gray-700 flex items-center justify-center"
                onClick={() => { setShowStake(false); setShowRisk(false); setStakeStr(''); setRootErr('') }}
              >
                <X size={14} strokeWidth={2} />
              </button>
            </div>
          )}

          <div className="flex gap-3">
            {pricingVisible && (trustView?.showPlaceBet ?? true) && !showStake && (
              <button
                className="btn-primary flex-1 flex items-center justify-center gap-1.5"
                onClick={() => {
                  if (analysis?.decision_id) {
                    trackClientEvent(EVENTS.DECISION_ACTION_PLACE_CLICKED, {
                      decision_id: analysis.decision_id,
                      odds_bucket: bucketOdds(analysis.offered_odds),
                      from_page: 'ai_page',
                    })
                  }
                  setShowStake(true)
                  setShowRisk(false)
                  setRootErr('')
                }}
                disabled={saving}
              >
                <CheckCircle size={14} strokeWidth={2} /> {trustView?.placeBetLabel ?? 'Place Bet'}
              </button>
            )}
            {trustView?.showWatch !== false && (
              <button
                className="flex-1 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-medium transition-colors border border-gray-700 disabled:opacity-50 flex items-center justify-center gap-1.5"
                onClick={() => handleAction('watchlisted')}
                disabled={saving}
              >
                <Eye size={14} strokeWidth={2} /> {trustView?.watchLabel ?? 'Watch'}
              </button>
            )}
            <button
              className="flex-1 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 text-sm font-medium transition-colors border border-gray-700 disabled:opacity-50 flex items-center justify-center gap-1.5"
              onClick={() => handleAction('skipped')}
              disabled={saving}
            >
              <X size={14} strokeWidth={2} /> {trustView?.skipLabel ?? 'Skip'}
            </button>
          </div>
          <p className="text-xs text-gray-600 text-center">
            {trustView?.locale === 'uk'
              ? 'Пропуск або спостереження буде збережено в історії рішень.'
              : 'Skipping or watching is a valid decision — it will be saved to your history.'}
          </p>
        </div>
      )}
    </div>
  )
}
