'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { trackClientEvent } from '@/lib/analytics/client'
import { EVENTS } from '@/lib/analytics/events'
import { bucketOdds, bucketStake } from '@/lib/analytics/buckets'
import RiskEvaluator from '@/components/risk/RiskEvaluator'
import { Camera, Eye, X, CheckCircle, Search } from 'lucide-react'
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
import {
  buildAnalystScannerSnapshot,
  clearAnalystScannerLegsAfterManualEdit,
  createAnalystScanGenerationGate,
  hasUnsupportedLiveAnalystInput,
  type AnalystResearchBrief,
  type AnalystResearchSource,
  type AnalystWebSearchFailureReason,
} from '@/lib/ai/analyst-research'
import { BroadcastStatus } from '@/components/ui/BroadcastNoir'
import { broadcastNoirColors, type BroadcastNoirStatus } from '@/lib/ui/broadcast-noir'

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
type CaptureMode = 'coupon' | 'event'
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
  web_search_enabled?: boolean
  web_search_attempted?: boolean
  web_search_used?:     boolean
  web_search_failure_reason?: AnalystWebSearchFailureReason | null
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

type ScannedLiveEnvelope = {
  isLive: boolean
  statusText: string | null
  periodOrPhase: string | null
  scoreText: string | null
}

type ScannedCouponState = {
  legs: AnalysisLegQualityInput[] | null
  liveEnvelope: ScannedLiveEnvelope
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
  const sourceByUrl = new Map(sources.map(source => [source.url, source]))
  const lines = [
    'CONDITIONAL MARKET REVIEW — not a verified current-fact report',
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
    ...brief.sourcedClaims.flatMap(claim => {
      const source = sourceByUrl.get(claim.sourceUrl)
      return source ? [`Cited claim: “${claim.text}” — ${source.title} — ${claim.sourceUrl}`] : []
    }),
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

const REC_CONFIG: Record<Recommendation, { label: string; status: BroadcastNoirStatus }> = {
  bet:      { label: 'BET', status: 'neutral' },
  watch:    { label: 'WATCH', status: 'review' },
  skip:     { label: 'SKIP', status: 'neutral' },
  no_value: { label: 'NO VALUE', status: 'neutral' },
}

const RISK_CONFIG: Record<RiskLevel, { label: string; status: BroadcastNoirStatus }> = {
  low:    { label: 'Low Risk', status: 'neutral' },
  medium: { label: 'Medium Risk', status: 'review' },
  high:   { label: 'High Risk', status: 'negative' },
}

function scanStatusTone(message: string, scanning: boolean, mode: CaptureMode): BroadcastNoirStatus {
  if (scanning) return 'neutral'
  if (message.startsWith('✅')) return 'success'
  if (mode === 'event') return 'review'
  return 'negative'
}

// ─── Score bar ────────────────────────────────────────────────
function ScoreBar({ score }: { score: number }) {
  const color = score < 0 ? 'bg-bn-negative' : 'bg-bn-data'
  return (
    <div className="flex items-center gap-2 mt-0.5">
      <div className="relative h-1.5 flex-1 rounded-control bg-bn-raised">
        <div className="absolute bottom-0 left-1/2 top-0 w-px bg-bn-border-strong" />
        <div
          className={`h-1.5 rounded-control ${color} transition-all`}
          style={{ width: `${Math.abs(score) / 3 * 50}%`, marginLeft: score >= 0 ? '50%' : `${50 - Math.abs(score) / 3 * 50}%` }}
        />
      </div>
      <span className={`w-6 text-right font-mono text-xs ${score < 0 ? 'text-bn-negative' : 'text-bn-data'}`}>
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
  const selectedFileRef = useRef<File | null>(null)
  const scanGenerationGateRef = useRef(createAnalystScanGenerationGate())

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
  const [captureMode, setCaptureMode] = useState<CaptureMode>('coupon')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [stakeStr,   setStakeStr]   = useState('')
  const [showStake,  setShowStake]  = useState(false)
  const [showRisk,   setShowRisk]   = useState(false)
  const [scannedCoupon, setScannedCoupon] = useState<ScannedCouponState | null>(null)
  const couponLegs = scannedCoupon?.legs ?? null
  const scannedLiveEnvelope = scannedCoupon?.liveEnvelope ?? null
  const liveCouponBlocked = hasUnsupportedLiveAnalystInput({
    couponIsLive: scannedLiveEnvelope?.isLive,
    couponStatusText: scannedLiveEnvelope?.statusText,
    legs: couponLegs,
  })

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
  }, [previewUrl])

  function setField(k: string, v: string) {
    setForm(f => ({ ...f, [k]: v }))
    setErrors(e => ({ ...e, [k]: '' }))
    if (['event_name', 'market_type', 'selection', 'odds'].includes(k)) {
      setScannedCoupon(clearAnalystScannerLegsAfterManualEdit)
    }
  }

  // ── Scanner ────────────────────────────────────────────────
  const runScanner = useCallback(async (file: File) => {
    const scanGeneration = scanGenerationGateRef.current.begin()
    setScanning(true)
    setScanMsg('Scanning coupon...')
    try {
      const { data, media_type } = await fileToBase64(file)
      if (!scanGenerationGateRef.current.isCurrent(scanGeneration)) return
      const res = await fetch('/api/ai/scanner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: data, media_type }),
      })
      const json = await res.json()
      if (!scanGenerationGateRef.current.isCurrent(scanGeneration)) return
      if (!res.ok || !json.success) { setScanMsg(json.error ?? 'Scan failed'); return }
      const d = json.data
      const SPORTS_LIST: Sport[] = ['tennis', 'soccer', 'cs2', 'basketball', 'ice_hockey', 'mma', 'other']
      const snapshot = buildAnalystScannerSnapshot<AnalysisLegQualityInput>(d)
      setForm(prev => ({
        ...prev,
        event_name:  snapshot.form.eventName,
        market_type: snapshot.form.marketType,
        selection:   snapshot.form.selection,
        line:        '',
        odds:        snapshot.form.odds,
        bookmaker:   snapshot.form.bookmaker,
        event_time:  snapshot.form.eventTime,
      }))
      setScannedCoupon({
        legs: snapshot.legs,
        liveEnvelope: snapshot.liveEnvelope,
      })
      setSport(SPORTS_LIST.includes(d.sport) ? d.sport as Sport : 'other')
      setScanMsg('\u2705 Coupon scanned \u2014 review and analyze')
    } catch {
      if (scanGenerationGateRef.current.isCurrent(scanGeneration)) {
        setScanMsg('Scan error \u2014 try again')
      }
    } finally {
      if (scanGenerationGateRef.current.finish(scanGeneration)) setScanning(false)
    }
  }, [])

  const selectCapture = useCallback((file: File) => {
    selectedFileRef.current = file
    setPreviewUrl(current => {
      if (current) URL.revokeObjectURL(current)
      return URL.createObjectURL(file)
    })
    setAnalysis(null)
    setRootErr('')
    if (captureMode === 'event') {
      setScanMsg('Event capture is not connected yet — image kept for review.')
      return
    }
    void runScanner(file)
  }, [captureMode, runScanner])

  const removeCapture = useCallback(() => {
    selectedFileRef.current = null
    setPreviewUrl(current => {
      if (current) URL.revokeObjectURL(current)
      return null
    })
    setScanMsg('')
    setScannedCoupon(null)
  }, [])

  const changeCaptureMode = useCallback((mode: CaptureMode) => {
    if (scanning || mode === captureMode) return
    setCaptureMode(mode)
    setAnalysis(null)
    if (mode === 'event') {
      setScanMsg(selectedFileRef.current ? 'Event capture is not connected yet — image kept for review.' : '')
      return
    }
    if (selectedFileRef.current) void runScanner(selectedFileRef.current)
    else setScanMsg('')
  }, [captureMode, runScanner, scanning])

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const imageItem = Array.from(e.clipboardData.items).find(i => i.type.startsWith('image/'))
    if (imageItem) { const f = imageItem.getAsFile(); if (f) selectCapture(f) }
  }, [selectCapture])

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (f) selectCapture(f); e.target.value = ''
  }, [selectCapture])

  // ── Analyze ────────────────────────────────────────────────
  const handleAnalyze = useCallback(async () => {
    setErrors({})
    setRootErr('')
    setAnalysis(null)

    if (scanGenerationGateRef.current.isActive()) {
      setRootErr(locale === 'uk' ? 'Дочекайтеся завершення сканування купона.' : 'Wait for coupon scanning to finish.')
      return
    }

    const newErrors: Record<string, string> = {}
    if (!form.event_name.trim()) newErrors.event_name = 'Required'
    if (!form.market_type.trim()) newErrors.market_type = 'Required'
    const odds = parseFloat(form.odds)
    if (!form.odds || isNaN(odds) || odds <= 1) newErrors.odds = 'Must be > 1.00'
    if (Object.keys(newErrors).length) { setErrors(newErrors); return }
    if (liveCouponBlocked) {
      setRootErr(locale === 'uk'
        ? 'Live-аналіз недоступний без поточного рахунку, фази матчу, ігрового часу та актуальної live-лінії. Використайте pre-match купон.'
        : 'Live analysis requires the current score, match phase, game clock, and current live odds. Use a pre-match coupon.')
      return
    }

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
          coupon_is_live: scannedLiveEnvelope?.isLive ?? false,
          coupon_status_text: scannedLiveEnvelope?.statusText ?? undefined,
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
  }, [sport, locale, form, scoutId, couponLegs, scannedLiveEnvelope, liveCouponBlocked])

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
  <div class="research-kicker">CONDITIONAL MARKET REVIEW</div>
  <h2>${escapeHtml(a.research_brief.headline)}</h2>
  <p>${escapeHtml(a.research_brief.summary)}</p>
  <p><strong>Trust boundary:</strong> Narrative analysis is conditional. Only verbatim excerpts under Cited claims are bound to current sources.</p>
  ${a.research_brief.builderRisk ? `<div class="builder"><strong>Bet Builder correlation</strong><br>${escapeHtml(a.research_brief.builderRisk)}</div>` : ''}
  ${a.research_brief.legs.map(leg => `<div class="research-leg">
    <strong>${leg.legNumber}. ${escapeHtml(leg.eventName)}</strong>
    <div>${escapeHtml(leg.marketType)}${leg.selection ? ` · ${escapeHtml(leg.selection)}` : ''}</div>
    <p>${escapeHtml(leg.assessment)}</p>
    ${leg.evidence.length ? `<ul>${leg.evidence.map(item => `<li>+ Conditional: ${escapeHtml(item)}</li>`).join('')}</ul>` : ''}
    ${leg.risks.length ? `<ul>${leg.risks.map(item => `<li>− ${escapeHtml(item)}</li>`).join('')}</ul>` : ''}
  </div>`).join('')}
  <div class="verdict"><strong>Verdict</strong><br>${escapeHtml(a.research_brief.verdict)}</div>
  ${a.research_brief.sourcedClaims.length ? `<div class="sources"><strong>Cited claims</strong><ul>${a.research_brief.sourcedClaims.map(claim => `<li>“${escapeHtml(claim.text)}” — ${escapeHtml(claim.sourceUrl)}</li>`).join('')}</ul></div>` : ''}
</section>` : ''
    const pricingHtml = showPricing
      ? `<div class="grid">
  <div class="stat"><div class="stat-label">Model probability</div><div class="stat-value">${a.model_probability?.toFixed(1)}%</div></div>
  <div class="stat"><div class="stat-label">Implied probability</div><div class="stat-value">${a.implied_probability?.toFixed(1)}%</div></div>
  <div class="stat"><div class="stat-label">Edge</div><div class="stat-value" style="color:${(a.edge_percent ?? 0)>=0?'var(--bn-data-value)':'var(--bn-negative)'}">${(a.edge_percent ?? 0)>=0?'+':''}${a.edge_percent?.toFixed(1)}%</div></div>
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
      `<tr><td>${escapeHtml(f.name)}</td><td style="text-align:center;font-weight:bold;color:${f.score<0?'var(--bn-negative)':'var(--bn-data-value)'}">${f.score>0?'+':''}${f.score}</td><td style="color:var(--bn-border-strong);font-size:12px">${escapeHtml(f.detail)}</td></tr>`
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
  :root{
    color-scheme:dark;
    --bn-night:${broadcastNoirColors.night};
    --bn-field:${broadcastNoirColors.field};
    --bn-raised:${broadcastNoirColors.fieldRaised};
    --bn-border-subtle:${broadcastNoirColors.borderSubtle};
    --bn-border-strong:${broadcastNoirColors.borderStrong};
    --bn-text:${broadcastNoirColors.textPrimary};
    --bn-muted:${broadcastNoirColors.textMuted};
    --bn-quiet:${broadcastNoirColors.textQuiet};
    --bn-data-value:${broadcastNoirColors.dataValue};
    --bn-signal:${broadcastNoirColors.signal};
    --bn-on-signal:${broadcastNoirColors.onSignal};
    --bn-negative:${broadcastNoirColors.negative};
    --bn-review:${broadcastNoirColors.review};
  }
  body{font-family:system-ui,sans-serif;max-width:700px;margin:40px auto;padding:20px;color:var(--bn-text);background:var(--bn-night)}
  h1{font-size:22px;margin-bottom:4px}
  .meta{color:var(--bn-muted);font-size:13px;margin-bottom:20px}
  .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:16px 0}
  .stat{background:var(--bn-raised);padding:12px;border-radius:8px;text-align:center}
  .stat-label{font-size:11px;color:var(--bn-quiet);margin-bottom:4px}
  .stat-value{font-size:22px;font-weight:700}
  .quality-gate{background:var(--bn-raised);border:1px solid var(--bn-review);padding:14px;border-radius:8px;margin:16px 0}
  .research{border:1px solid var(--bn-border-strong);padding:16px;margin:16px 0}
  .research h2{font-size:20px;margin:8px 0}
  .research-kicker{font-size:10px;font-weight:800;letter-spacing:.08em}
  .builder{background:var(--bn-signal);border:1px solid var(--bn-border-subtle);color:var(--bn-on-signal);padding:10px;margin:12px 0}
  .research-leg{border-top:1px solid var(--bn-border-strong);padding:12px 0}
  .research-leg p,.research-leg li,.sources li{font-size:12px;line-height:1.5}
  .verdict{border-top:1px solid var(--bn-border-strong);padding-top:12px}
  .gate-kicker{font-size:11px;color:var(--bn-review);text-transform:uppercase;font-weight:700;letter-spacing:.04em}
  .gate-label{font-size:18px;font-weight:800;color:var(--bn-review);margin-top:4px}
  .gate-support,.gate-score{font-size:12px;color:var(--bn-muted);margin-top:4px}
  .gate-missing-title{font-size:12px;font-weight:700;color:var(--bn-review);margin-top:10px}
  .gate-missing{font-size:12px;color:var(--bn-muted);margin-top:4px;padding-left:18px}
  .rec{display:inline-block;padding:4px 12px;border-radius:6px;font-weight:700;font-size:14px;background:var(--bn-raised);margin-bottom:12px}
  .reasoning{background:var(--bn-raised);padding:14px;border-radius:8px;margin:12px 0;line-height:1.6}
  table{width:100%;border-collapse:collapse;margin-top:12px}
  th{text-align:left;font-size:12px;color:var(--bn-quiet);padding:6px 8px;border-bottom:1px solid var(--bn-border-subtle)}
  td{padding:7px 8px;border-bottom:1px solid var(--bn-border-subtle);font-size:13px;vertical-align:top}
  .disclaimer{font-size:11px;color:var(--bn-quiet);margin-top:16px;padding-top:12px;border-top:1px solid var(--bn-border-subtle)}
  .footer{margin-top:24px;font-size:11px;color:var(--bn-quiet);text-align:center}
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
    <main className="bn-page mx-auto flex w-full max-w-5xl flex-col gap-4 pb-8" onPaste={handlePaste}>
      <section className="bn-panel relative overflow-hidden p-5 sm:p-7 lg:p-9">
        <div aria-hidden="true" className="absolute inset-y-0 left-0 w-1 bg-bn-signal" />
        <p className="editorial-kicker">AI Scanner · explicit review</p>
        <h1 className="mt-4 max-w-3xl font-display text-[clamp(2.4rem,7vw,5.5rem)] font-black leading-[0.92] tracking-[-0.055em] text-bn-text">
          Capture. Extract. Review.
        </h1>
        <p className="mt-5 max-w-2xl text-sm leading-6 text-bn-muted sm:text-base">
          Add a screenshot, verify every extracted field, then choose whether to continue. Analyze never saves a bet automatically.
        </p>
      </section>

      {/* ── Scout pre-fill indicator ───────────────────────── */}
      {scoutId && !analysis && (
        <div className="flex min-h-11 items-center gap-2 rounded-control border border-bn-signal bg-bn-field px-3 py-2 text-xs text-bn-signal">
          <Search size={12} strokeWidth={2} />
          Pre-filled from Scout — enter current odds to analyse
        </div>
      )}

      {/* ── Scanner zone ────────────────────────────────────── */}
      <section className="bn-panel overflow-hidden" aria-labelledby="capture-heading">
        <div className="grid grid-cols-2 border-b border-bn-border-strong" role="radiogroup" aria-label="Capture type">
          {(['coupon', 'event'] as const).map((mode, index) => (
            <button
              aria-checked={captureMode === mode}
              className={`min-h-12 border-r border-bn-border-strong px-4 text-left text-xs font-black uppercase tracking-[0.1em] last:border-r-0 ${captureMode === mode ? 'bg-bn-signal text-bn-on-signal' : 'bg-bn-field text-bn-muted hover:bg-bn-raised'}`}
              disabled={scanning}
              key={mode}
              onClick={() => changeCaptureMode(mode)}
              role="radio"
              type="button"
            >
              <span className="mr-2 font-mono">0{index + 1}</span>{mode}
            </button>
          ))}
        </div>

        <input ref={fileRef} aria-label="Coupon screenshot" type="file" accept="image/*" className="sr-only" onChange={handleFileChange} />
        {previewUrl ? (
          <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_18rem]">
            <div className="relative min-h-80 bg-bn-night">
              <Image alt={`Selected ${captureMode} screenshot preview`} className="h-full w-full object-contain" fill sizes="(max-width: 1024px) 100vw, 70vw" src={previewUrl} unoptimized />
              {scanning ? <div aria-hidden="true" className="bn-operation-sweep absolute inset-x-0 top-0 h-1 bg-bn-signal" /> : null}
            </div>
            <div className="flex flex-col gap-3 border-t border-bn-border-strong p-5 lg:border-l lg:border-t-0">
              <p id="capture-heading" className="font-mono text-[11px] font-black uppercase tracking-[0.12em] text-bn-text">Preview ready</p>
              <p className="text-sm leading-6 text-bn-muted">Replace or remove the image before continuing. Coupon extraction remains editable below.</p>
              {scanMsg ? (
                <BroadcastStatus className="w-full" aria-live="polite" status={scanStatusTone(scanMsg, scanning, captureMode)}>{scanMsg.replace('✅ ', '')}</BroadcastStatus>
              ) : null}
              <div className="mt-auto grid gap-2">
                <button className="bn-button bn-button-secondary" disabled={scanning} onClick={() => fileRef.current?.click()} type="button">Replace image</button>
                <button className="bn-button bn-button-destructive" disabled={scanning} onClick={removeCapture} type="button">Remove image</button>
              </div>
            </div>
          </div>
        ) : (
          <button
            className="group grid min-h-80 w-full place-items-center px-5 py-10 text-center hover:bg-bn-raised"
            disabled={scanning}
            onClick={() => fileRef.current?.click()}
            type="button"
          >
            <span>
              <Camera aria-hidden="true" className="mx-auto text-bn-data" size={34} strokeWidth={1.5} />
              <span id="capture-heading" className="mt-5 block font-display text-2xl font-black tracking-[-0.04em] text-bn-text">Choose screenshot</span>
              <span className="mt-2 block text-sm text-bn-muted">Paste, camera export or photo library</span>
            </span>
          </button>
        )}
      </section>

      {/* ── Sport selector ──────────────────────────────────── */}
      <fieldset>
        <legend className="label mb-2">Sport</legend>
        <div className="flex flex-wrap gap-2">
          {SPORTS.map(s => (
            <button
              aria-pressed={sport === s.value}
              key={s.value}
              onClick={() => setSport(s.value)}
              type="button"
              className={`min-h-11 rounded-control border px-3 py-2 text-sm font-bold ${
                sport === s.value
                  ? 'border-bn-signal bg-bn-signal text-bn-on-signal'
                  : 'border-bn-border-strong bg-bn-field text-bn-muted hover:border-bn-signal'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </fieldset>

      {/* ── Form ────────────────────────────────────────────── */}
      <div className="bn-panel flex flex-col gap-4 p-4 sm:p-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="label" htmlFor="ai-event-name">Event *</label>
            <input
              id="ai-event-name"
              className={`input ${errors.event_name ? 'border-bn-negative' : ''}`}
              placeholder="Germany vs Netherlands"
              value={form.event_name}
              onChange={e => setField('event_name', e.target.value)}
            />
            {errors.event_name && <p className="mt-1 text-xs text-bn-negative">{errors.event_name}</p>}
          </div>

          <div>
            <label className="label" htmlFor="ai-market-type">Market *</label>
            <input
              id="ai-market-type"
              className={`input ${errors.market_type ? 'border-bn-negative' : ''}`}
              placeholder="Match Winner / Total / Handicap"
              value={form.market_type}
              onChange={e => setField('market_type', e.target.value)}
            />
            {errors.market_type && <p className="mt-1 text-xs text-bn-negative">{errors.market_type}</p>}
          </div>

          <div>
            <label className="label" htmlFor="ai-selection">Selection</label>
            <input
              id="ai-selection"
              className="input"
              placeholder="Germany / Over / -1"
              value={form.selection}
              onChange={e => setField('selection', e.target.value)}
            />
          </div>

          <div>
            <label className="label" htmlFor="ai-odds">Odds *</label>
            <input
              id="ai-odds"
              className={`input ${errors.odds ? 'border-bn-negative' : ''}`}
              type="number" step="0.01" min="1.01" placeholder={scoutId ? 'Enter current odds' : '1.85'}
              value={form.odds}
              onChange={e => setField('odds', e.target.value)}
            />
            {errors.odds && <p className="mt-1 text-xs text-bn-negative">{errors.odds}</p>}
          </div>

          <div>
            <label className="label" htmlFor="ai-line">Line</label>
            <input
              id="ai-line"
              className="input"
              type="number" step="0.5" placeholder="+1.5 / 2.5"
              value={form.line}
              onChange={e => setField('line', e.target.value)}
            />
          </div>

          <div>
            <label className="label" htmlFor="ai-bookmaker">Bookmaker</label>
            <input
              id="ai-bookmaker"
              className="input"
              placeholder="Bet365, Pinnacle…"
              value={form.bookmaker}
              onChange={e => setField('bookmaker', e.target.value)}
            />
          </div>

          <div>
            <label className="label" htmlFor="ai-output-language">Output language</label>
            <select id="ai-output-language" className="input" value={locale} onChange={e => setLocale(e.target.value as Locale)}>
              {LOCALES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
            </select>
          </div>

          <div className="sm:col-span-2">
            <label className="label" htmlFor="ai-coupon-date-time">Coupon date / time</label>
            <input
              id="ai-coupon-date-time"
              className="input"
              placeholder="Today, 22:10 / 19.07.2026, 22:10"
              value={form.event_time}
              onChange={e => setField('event_time', e.target.value)}
            />
            <p className="mt-1 text-[11px] text-bn-muted">Keep the exact text from the coupon so the Analyst can identify the fixture.</p>
          </div>

          <div className="sm:col-span-2">
            <label className="label" htmlFor="ai-context-notes">Context / Notes</label>
            <textarea
              id="ai-context-notes"
              className="input resize-none" rows={2}
              placeholder="Injuries, lineups, motivation, recent form, anything relevant…"
              value={form.notes}
              onChange={e => setField('notes', e.target.value)}
            />
          </div>
        </div>

        {couponLegs && couponLegs.length > 0 && (
          <section className="rounded-control border border-bn-border-strong bg-bn-night" aria-labelledby="coupon-legs-heading">
            <div className="flex items-center justify-between border-b border-bn-border-strong px-4 py-3">
              <h2 id="coupon-legs-heading" className="font-mono text-[11px] font-black uppercase tracking-[0.12em] text-bn-text">
                Extracted coupon legs
              </h2>
              <span className="rounded-control border border-bn-border-strong bg-bn-field px-2 py-1 font-mono text-[11px] font-black text-bn-data">{couponLegs.length}</span>
            </div>
            <div className="divide-y divide-bn-border-subtle">
              {couponLegs.map((leg, index) => (
                <article key={`${leg.eventName ?? 'leg'}-${index}`} className="grid gap-2 px-4 py-4 sm:grid-cols-[44px_1fr_auto]">
                  <div className="flex h-9 w-9 items-center justify-center rounded-control border border-bn-border-strong font-mono text-xs font-black text-bn-muted">
                    {String(index + 1).padStart(2, '0')}
                  </div>
                  <div className="min-w-0">
                    <p className="font-display text-base font-black text-bn-text">{leg.eventName || form.event_name}</p>
                    <p className="mt-1 text-sm text-bn-muted">
                      {leg.marketType || form.market_type}{leg.selection ? ` · ${leg.selection}` : ''}
                    </p>
                  </div>
                  <div className="font-mono text-sm font-black text-bn-data">
                    {leg.odds != null ? Number(leg.odds).toFixed(2) : '—'}
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        {liveCouponBlocked && (
          <BroadcastStatus className="w-full" role="alert" status="review">
            {locale === 'uk'
              ? 'LIVE ЗАБЛОКОВАНО: для чесного аналізу потрібні поточний рахунок, фаза, ігровий час та актуальна live-лінія. Цей модуль працює лише з pre-match купонами.'
              : 'LIVE BLOCKED: a trustworthy analysis needs the current score, phase, game clock, and current live odds. This module supports pre-match coupons only.'}
          </BroadcastStatus>
        )}

        {rootErr && !analysis && (
          <BroadcastStatus className="w-full" role="alert" status="negative">{rootErr}</BroadcastStatus>
        )}

        <button
          className="btn-primary flex items-center justify-center gap-2"
          onClick={handleAnalyze}
          disabled={analyzing || scanning || liveCouponBlocked}
        >
          {analyzing ? (
            <>Analyzing…</>
          ) : scanning ? (
            <>Scanning…</>
          ) : liveCouponBlocked ? (
            <>Live analysis unavailable</>
          ) : (
            <><Search size={14} strokeWidth={2} /> Analyze</>
          )}
        </button>
      </div>

      {/* ── Analysis result ─────────────────────────────────── */}
      {a && (
        <div className="flex flex-col gap-4">
          <section className="rounded-control border border-bn-border-strong bg-bn-field px-5 py-4 text-bn-text" aria-label="Web research status">
            <BroadcastStatus status={a.web_search_used ? 'success' : a.web_search_attempted ? 'review' : 'neutral'}>
              {a.web_search_used ? 'Current research verified' : a.web_search_attempted ? 'Current research unavailable' : 'Web research disabled'}
            </BroadcastStatus>
            <p className="mt-2 text-sm font-bold leading-5">
              {a.web_search_used
                ? `${a.research_sources?.length ?? 0} cited source${a.research_sources?.length === 1 ? '' : 's'} bound to exact claims.`
                : a.web_search_attempted
                  ? 'No current claim was accepted without an exact citation. Pricing remains hidden.'
                  : 'This run contains conditional market logic only; no current fact is presented as verified.'}
            </p>
            {a.web_search_failure_reason && (
              <p className="mt-2 font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-bn-muted">
                {a.web_search_failure_reason.replaceAll('_', ' ')}
              </p>
            )}
          </section>

          {a.research_brief && (
            <section className="overflow-hidden rounded-control border border-bn-border-strong bg-bn-field text-bn-text" aria-labelledby="research-brief-heading">
              <div className="border-b border-bn-border-strong bg-bn-night px-5 py-4 text-bn-text">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="font-mono text-[11px] font-black uppercase tracking-[0.14em] text-bn-signal">
                    Conditional market review
                  </p>
                  <span className="rounded-control border border-bn-border-strong px-2 py-1 font-mono text-[11px] font-bold uppercase tracking-[0.1em] text-bn-data">
                    {a.research_brief.legs.length} {a.research_brief.legs.length === 1 ? 'leg' : 'legs'}
                  </span>
                </div>
                <h2 id="research-brief-heading" className="mt-4 max-w-3xl font-display text-3xl font-black leading-[0.95] tracking-[-0.045em] text-bn-text md:text-5xl">
                  {a.research_brief.headline}
                </h2>
                <p className="mt-4 max-w-3xl text-sm leading-6 text-bn-muted">{a.research_brief.summary}</p>
                <p className="mt-3 max-w-3xl border-l-2 border-bn-signal pl-3 font-mono text-[11px] font-bold uppercase leading-4 tracking-[0.08em] text-bn-muted">
                  Narrative analysis is conditional. Only verbatim excerpts under Cited claims are bound to current sources.
                </p>
              </div>

              {a.research_brief.builderRisk && (
                <div className="border-b border-bn-border-strong bg-bn-raised px-5 py-4">
                  <p className="font-mono text-[11px] font-black uppercase tracking-[0.12em] text-bn-review">Bet Builder correlation</p>
                  <p className="mt-2 text-sm font-semibold leading-6 text-bn-text">{a.research_brief.builderRisk}</p>
                </div>
              )}

              <div className="divide-y divide-bn-border-strong">
                {a.research_brief.legs.map(leg => (
                  <article key={`${leg.legNumber}-${leg.eventName}-${leg.marketType}`} className="grid gap-4 px-5 py-5 md:grid-cols-[54px_1fr]">
                    <div className="flex h-11 w-11 items-center justify-center rounded-control border border-bn-border-strong font-mono text-xs font-black text-bn-data">
                      {String(leg.legNumber).padStart(2, '0')}
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <h3 className="font-display text-xl font-black tracking-[-0.025em]">{leg.eventName}</h3>
                          <p className="mt-1 text-sm text-bn-muted">{leg.marketType}{leg.selection ? ` · ${leg.selection}` : ''}</p>
                        </div>
                        <span className="rounded-control border border-bn-border-strong px-2 py-1 font-mono text-[11px] font-black uppercase tracking-[0.1em] text-bn-muted">
                          {leg.fixtureStatus.replaceAll('_', ' ')}
                        </span>
                      </div>
                      <p className="mt-4 text-sm font-semibold leading-6">{leg.assessment}</p>

                      <div className="mt-4 grid gap-4 md:grid-cols-2">
                        <div>
                          <p className="font-mono text-[11px] font-black uppercase tracking-[0.12em] text-bn-muted">Conditional logic</p>
                          <ul className="mt-2 space-y-1.5 text-sm leading-5 text-bn-muted">
                            {leg.evidence.length > 0
                              ? leg.evidence.map((item, itemIndex) => <li key={`${itemIndex}-${item}`}>+ {item}</li>)
                              : <li>+ No additional conditional note.</li>}
                          </ul>
                        </div>
                        <div>
                          <p className="font-mono text-[11px] font-black uppercase tracking-[0.12em] text-bn-muted">Failure modes</p>
                          <ul className="mt-2 space-y-1.5 text-sm leading-5 text-bn-muted">
                            {leg.risks.map((item, itemIndex) => <li key={`${itemIndex}-${item}`}>− {item}</li>)}
                          </ul>
                        </div>
                      </div>
                    </div>
                  </article>
                ))}
              </div>

              <div className="border-t border-bn-border-strong px-5 py-5">
                <p className="font-mono text-[11px] font-black uppercase tracking-[0.12em] text-bn-muted">Analyst verdict</p>
                <p className="mt-2 text-base font-bold leading-6">{a.research_brief.verdict}</p>
                {a.research_brief.dataGaps.length > 0 && (
                  <div className="mt-4 border-l-4 border-bn-review pl-4">
                    <p className="font-mono text-[11px] font-black uppercase tracking-[0.12em] text-bn-review">Still unverified</p>
                    <ul className="mt-2 space-y-1 text-sm text-bn-muted">
                      {a.research_brief.dataGaps.map((item, itemIndex) => <li key={`${itemIndex}-${item}`}>— {item}</li>)}
                    </ul>
                  </div>
                )}
              </div>

              {a.research_brief.sourcedClaims.length > 0 && a.research_sources && a.research_sources.length > 0 && (
                <div className="border-t border-bn-border-strong bg-bn-night px-5 py-5">
                  <p className="font-mono text-[11px] font-black uppercase tracking-[0.12em] text-bn-muted">Cited claims — verbatim source excerpts</p>
                  <div className="mt-3 grid gap-2 md:grid-cols-2">
                    {a.research_brief.sourcedClaims.map((claim, claimIndex) => {
                      const source = a.research_sources?.find(item => item.url === claim.sourceUrl)
                      if (!source) return null
                      return (
                      <a
                        key={`${claimIndex}-${source.url}-${claim.text}`}
                        href={source.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-control border border-bn-border-strong bg-bn-field px-3 py-3 text-sm font-bold text-bn-text underline decoration-1 underline-offset-4 hover:border-bn-signal"
                      >
                        <span className="block no-underline">“{claim.text}”</span>
                        <span className="mt-2 block">{source.title}</span>
                        <span className="mt-1 block font-mono text-[11px] font-black uppercase tracking-[0.08em] text-bn-muted no-underline">
                          {new URL(source.url).hostname}
                        </span>
                      </a>
                      )
                    })}
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
              <div className="flex flex-col gap-3 rounded-control border border-bn-border-strong bg-bn-field p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <BroadcastStatus status={showPricing ? rec.status : 'review'}>
                      {showPricing ? rec.label : a.research_brief ? researchedNoPriceLabel : trust?.label ?? gate?.label ?? 'INSUFFICIENT DATA'}
                    </BroadcastStatus>
                    <p className="mt-1 text-xs text-bn-muted">
                      {showPricing ? recDetail[a.recommendation] : a.research_brief ? researchedNoPriceSupport : trust?.supportLabel ?? gate?.supportLabel ?? 'Unsupported / partially supported bet'}
                    </p>
                  </div>
                  {showPricing ? (
                  <div className="text-right shrink-0">
                      <BroadcastStatus status={risk.status}>{risk.label}</BroadcastStatus>
                    <p className="mt-1 text-[11px] text-bn-muted">edge · confidence · market</p>
                  </div>
                  ) : (
                    <div className="text-right shrink-0">
                      <BroadcastStatus status={risk.status}>{localizedRiskLabel(a.risk_level, risk.label, trust)}</BroadcastStatus>
                      <p className="mt-1 text-[11px] text-bn-muted">{trust ? `${trust.riskWarningLabel} / ${trust.dataCoverageLabel}` : 'risk warning / data coverage'}</p>
                    </div>
                  )}
                </div>

                {/* Probabilities */}
                {showPricing ? (
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div>
                    <div className="mb-1 text-xs text-bn-muted">Model prob.</div>
                    <div className="text-xl font-bold text-bn-data">{a.model_probability?.toFixed(1)}%</div>
                    <div className="mt-1 text-[11px] text-bn-muted">AI win estimate</div>
                  </div>
                  <div>
                    <div className="mb-1 text-xs text-bn-muted">Implied</div>
                    <div className="text-xl font-bold text-bn-data">{a.implied_probability?.toFixed(1)}%</div>
                    <div className="mt-1 text-[11px] text-bn-muted">From your odds</div>
                  </div>
                  <div>
                    <div className="mb-1 text-xs text-bn-muted">Edge</div>
                    <div className={`text-xl font-bold ${(a.edge_percent ?? 0) >= 0 ? 'text-bn-data' : 'text-bn-negative'}`}>
                      {(a.edge_percent ?? 0) >= 0 ? '+' : ''}{a.edge_percent?.toFixed(1)}%
                    </div>
                    <div className="mt-1 text-[11px] text-bn-muted">Model minus implied</div>
                  </div>
                </div>
                ) : gate && (
                  <div className="rounded-control border border-bn-review bg-bn-night px-3 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-wide text-bn-review">{trust?.riskWarningLabel ?? 'Risk warning'}</div>
                        <div className="mt-1 text-sm text-bn-text">{trust?.supportLabel ?? gate.supportLabel}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-bn-review">{trust?.dataCoverageLabel ?? 'Data coverage'}</div>
                        <div className="text-lg font-bold text-bn-data">{gate.dataCoverageScore}/100</div>
                      </div>
                    </div>
                    {trust?.safeExplanation && (
                      <p className="mt-3 text-xs text-bn-muted">{trust.safeExplanation}</p>
                    )}
                    {trust && trust.legs.length > 0 ? (
                      <div className="mt-3">
                        <div className="mb-1 text-xs font-medium text-bn-review">{trust.missingDataChecklistLabel}</div>
                        <div className="flex flex-col gap-2">
                          {trust.legs.map(leg => (
                            <div key={`${leg.legLabel}-${leg.sport}-${leg.legNumber}`} className="rounded-control border border-bn-border-strong px-2 py-2 text-xs text-bn-text">
                              <div className="font-medium">{leg.legLabel} / {leg.sportLabel}</div>
                              <div className="mt-1 text-bn-muted">{leg.eventName}</div>
                              <div className="text-bn-muted">{leg.marketType}{leg.selection ? ` / ${leg.selection}` : ''}</div>
                              {leg.periodOrPhase && (
                                <div className="text-bn-muted">{trust.locale === 'uk' ? 'Період / фаза' : 'Period / phase'}: {leg.periodOrPhase}</div>
                              )}
                              {leg.statusSourceLabel && (
                                <div className="text-bn-muted">{trust.locale === 'uk' ? 'Джерело статусу' : 'Status source'}: {leg.statusSourceLabel}</div>
                              )}
                              {leg.odds != null && (
                                <div className="text-bn-data">{trust.locale === 'uk' ? 'Коефіцієнт' : 'Odds'}: {leg.odds}</div>
                              )}
                              <div className="mt-1 text-bn-review">{leg.fixtureStatusLabel} · {leg.supportLabel} · {leg.actionabilityLabel}</div>
                              <ul className="mt-1 list-disc pl-4 text-bn-muted">
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
                    <span className="text-bn-muted">{trust?.confidenceLabel ?? 'Confidence'}</span>
                    <span className="text-bn-data">{a.confidence_score}/100</span>
                  </div>
                  <div className="h-1.5 rounded-control bg-bn-raised">
                    <div
                      className="h-1.5 rounded-control bg-bn-data transition-all"
                      style={{ width: `${a.confidence_score}%` }}
                    />
                  </div>
                  <div className="mt-1 text-[11px] text-bn-muted">
                    {trust?.locale === 'uk'
                      ? 'Обережна впевненість без розрахунку ціни'
                      : 'How certain the model is in its estimate'}
                  </div>
                </div>

                {/* Reasoning */}
                <p className="text-sm leading-relaxed text-bn-text">{trust && !showPricing ? trust.displayReasoning : a.reasoning}</p>

                {/* Disclaimer */}
                {disclaimerText && (
                  <p className="mt-1 border-t border-bn-border-strong pt-2 text-xs text-bn-muted">{disclaimerText}</p>
                )}
              </div>
            )
          })()}

          {/* Factors */}
          <div className="bn-panel flex flex-col gap-2 p-4">
            <h3 className="mb-1 text-sm font-semibold text-bn-text">
              {a.research_brief && !pricingVisible
                ? (trustView?.locale === 'uk' ? 'Перевірка ціни' : 'Pricing verification')
                : trustView?.factorAnalysisLabel ?? 'Factor Analysis'}
            </h3>
            {(trustView && !pricingVisible ? trustView.displayFactors : a.factors).map((f, i) => (
              <div key={i} className="border-b border-bn-border-strong py-2 last:border-0">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-bn-text">{f.name}</span>
                </div>
                <ScoreBar score={f.score} />
                <p className="mt-1 text-xs text-bn-muted">{f.detail}</p>
              </div>
            ))}
          </div>

          {/* PDF + Share */}
          <div className="grid gap-2 sm:grid-cols-2">
            <button
              onClick={downloadPDF}
              className="bn-button bn-button-secondary"
            >
              \uD83D\uDCC4 {trustView?.downloadPdfLabel ?? 'Download PDF'}
            </button>
            <button
              onClick={handleShare}
              className="bn-button bn-button-secondary"
            >
              {copied ? `\u2705 ${trustView?.copiedLabel ?? 'Copied!'}` : `\uD83D\uDD17 ${trustView?.copyToShareLabel ?? 'Copy to share'}`}
            </button>
          </div>

          {/* Actions */}
          {rootErr && (
            <BroadcastStatus className="w-full" role="alert" status="negative">{rootErr}</BroadcastStatus>
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
            <div className="grid items-center gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
              <div>
                <label className="label" htmlFor="ai-stake">Stake</label>
                <input
                  id="ai-stake"
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="Stake amount"
                  className="input flex-1"
                  value={stakeStr}
                  onChange={e => { setStakeStr(e.target.value); setRootErr('') }}
                  autoFocus
                />
              </div>
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
                aria-label="Close stake input"
                className="bn-button bn-button-secondary px-3"
                onClick={() => { setShowStake(false); setShowRisk(false); setStakeStr(''); setRootErr('') }}
              >
                <X size={14} strokeWidth={2} />
              </button>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-3">
            {pricingVisible && (trustView?.showPlaceBet ?? true) && !showStake && (
              <button
                className="bn-button bn-button-primary"
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
                className="bn-button bn-button-secondary"
                onClick={() => handleAction('watchlisted')}
                disabled={saving}
              >
                <Eye size={14} strokeWidth={2} /> {trustView?.watchLabel ?? 'Watch'}
              </button>
            )}
            <button
              className="bn-button bn-button-secondary"
              onClick={() => handleAction('skipped')}
              disabled={saving}
            >
              <X size={14} strokeWidth={2} /> {trustView?.skipLabel ?? 'Skip'}
            </button>
          </div>
          <p className="text-center text-xs text-bn-muted">
            {trustView?.locale === 'uk'
              ? 'Пропуск або спостереження буде збережено в історії рішень.'
              : 'Skipping or watching is a valid decision — it will be saved to your history.'}
          </p>
        </div>
      )}
    </main>
  )
}
