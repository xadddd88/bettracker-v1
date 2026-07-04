export type PricingField = 'model_probability' | 'implied_probability' | 'edge_percent'
export type AnalysisQualityStatus = 'priced' | 'insufficient_data' | 'unsupported'
export type AnalysisType = 'risk_warning' | 'priced_betting_analysis'
export type SportModuleSupport = 'full' | 'approximate' | 'none'
export type FixtureStatus =
  | 'scheduled'
  | 'unknown'
  | 'live'
  | 'finished'
  | 'cancelled'
  | 'abandoned'
  | 'postponed'
  | 'retired'
  | 'walkover'
  | 'not_bettable'
export type AnalysisActionability = 'actionable' | 'status_unverified' | 'not_actionable' | 'live_not_supported'
export type LegSupportLevel = 'full' | 'approximate' | 'unsupported'
export type AnalystTrustLocale = 'en' | 'uk'
export type CouponStatusSource = 'coupon' | 'provider' | 'unknown'

export interface AnalysisDataCoverage {
  liveInjuries?: boolean
  teamNews?: boolean
  recentForm?: boolean
  lineMovement?: boolean
}

export interface AnalysisLegQualityInput {
  label?: string
  rawText?: string | null
  sport?: string | null
  eventName?: string | null
  marketType?: string | null
  selection?: string | null
  odds?: number | null
  isLive?: boolean
  periodOrPhase?: string | null
  statusText?: string | null
  scoreText?: string | null
  statusSource?: CouponStatusSource
  statusConfidence?: number | null
  actionability?: AnalysisActionability
  modelProbability?: number | null
  sportModuleSupport?: SportModuleSupport
  dataCoverage?: AnalysisDataCoverage
  fixtureStatus?: FixtureStatus | null
}

export interface AnalysisQualityGateInput {
  sport: string
  eventName: string
  marketType: string
  selection?: string | null
  notes?: string | null
  webSearchEnabled: boolean
  modelProbability?: number | null
  modelInputsPresent?: boolean
  sportModuleSupport?: SportModuleSupport
  dataCoverage?: AnalysisDataCoverage
  fixtureStatus?: FixtureStatus | null
  legs?: AnalysisLegQualityInput[]
}

export interface MissingDataByLeg {
  legLabel: string
  legNumber: number
  sport: string
  eventName: string | null
  marketType: string | null
  selection: string | null
  rawText?: string | null
  odds?: number | null
  isLive?: boolean
  periodOrPhase?: string | null
  statusText?: string | null
  scoreText?: string | null
  statusSource?: CouponStatusSource
  statusConfidence?: number | null
  fixtureStatus: FixtureStatus
  actionability: AnalysisActionability
  supportLevel: LegSupportLevel
  missing: string[]
}

export interface AnalysisQualityGateResult {
  status: AnalysisQualityStatus
  label:
    | 'PRICED BETTING ANALYSIS'
    | 'INSUFFICIENT DATA'
    | 'NO PRICE - unsupported mixed-sport parlay'
    | 'NO PRICE - unsupported / partially supported bet'
    | 'LIVE COUPON - live analysis unavailable'
    | 'NOT ACTIONABLE - event already started or finished'
  supportLabel: 'Priced betting analysis' | 'Unsupported / partially supported bet'
  pricingAllowed: boolean
  dataCoverageScore: number
  missingDataByLeg: MissingDataByLeg[]
  suppressedPricingFields: PricingField[]
  reasons: string[]
  analysisType: AnalysisType
  actionability: AnalysisActionability
}

export interface PricingFields {
  model_probability: number | null
  implied_probability: number | null
  edge_percent: number | null
}

export type AnalystRecommendation = 'bet' | 'skip' | 'watch' | 'no_value'
export type AnalystRiskLevel = 'low' | 'medium' | 'high'

export interface BuildAnalystPricingPayloadInput {
  qualityGate: AnalysisQualityGateResult
  modelProbability: number
  offeredOdds: number
  recommendation: AnalystRecommendation
  riskLevel: AnalystRiskLevel
}

export interface AnalystPricingPayload extends PricingFields {
  recommendation: AnalystRecommendation
  risk_level: AnalystRiskLevel
  edge_bucket: string
  quality_gate: AnalysisQualityGateResult
}

export interface PricingRenderInput {
  qualityGate?: AnalysisQualityGateResult | null
  modelProbability?: number | null
  impliedProbability?: number | null
  edgePercent?: number | null
}

export interface AnalystTrustFactor {
  name: string
  score: number
  detail: string
}

export interface AnalystTrustLeg {
  legLabel: string
  legNumber: number
  sport: string
  sportLabel: string
  eventName: string
  marketType: string
  selection: string | null
  rawText?: string | null
  odds?: number | null
  isLive?: boolean
  periodOrPhase?: string | null
  statusText?: string | null
  scoreText?: string | null
  statusSource?: CouponStatusSource
  statusSourceLabel?: string | null
  statusConfidence?: number | null
  fixtureStatus: FixtureStatus
  fixtureStatusLabel: string
  actionability: AnalysisActionability
  actionabilityLabel: string
  supportLevel: LegSupportLevel
  supportLabel: string
  missingData: string[]
}

export interface AnalystTrustView {
  locale: AnalystTrustLocale
  label: string
  supportLabel: string
  riskWarningLabel: string
  dataCoverageLabel: string
  missingDataChecklistLabel: string
  confidenceLabel: string
  factorAnalysisLabel: string
  downloadPdfLabel: string
  copyToShareLabel: string
  copiedLabel: string
  watchLabel: string
  skipLabel: string
  placeBetLabel: string
  uiDisclaimer: string
  riskDisclaimer: string
  footerDisclaimer: string
  shareHeader: string
  pdfHeader: string
  pdfFooter: string
  generatedLabel: string
  viaLabel: string
  dataCoverageScore: number
  actionability: AnalysisActionability
  actionabilityLabel: string
  safeExplanation: string
  safeNextSteps: string[]
  legs: AnalystTrustLeg[]
  showPlaceBet: boolean
  showWatch: boolean
  showSkip: boolean
  showRawAiAnalysis: boolean
  displayReasoning: string
  displayFactors: AnalystTrustFactor[]
}

export interface BuildAnalystTrustViewInput {
  qualityGate: AnalysisQualityGateResult
  locale?: string | null
  eventName: string
  marketType: string
  selection?: string | null
  rawReasoning?: string | null
  rawFactors?: AnalystTrustFactor[] | null
}

export interface AnalystTrustPayload {
  trust_view: AnalystTrustView
  reasoning: string
  factors: AnalystTrustFactor[]
}

export interface AnalystTrustRenderContext {
  eventName: string
  sport?: string | null
  marketType: string
  selection?: string | null
  offeredOdds?: number | string | null
  bookmaker?: string | null
  generatedDate?: Date | string | null
}

export interface AnalystDecisionSurfaceInput extends AnalystTrustRenderContext {
  qualityGate?: AnalysisQualityGateResult | null
  trustView?: AnalystTrustView | null
  locale?: string | null
  recommendation?: string | null
  finalAction?: string | null
  confidenceScore?: number | null
  modelProbability?: number | null
  impliedProbability?: number | null
  edgePercent?: number | null
  edgeBucket?: string | null
  rawReasoning?: string | null
  rawFactors?: AnalystTrustFactor[] | null
}

export interface AnalystDecisionSurfaceView {
  isTrustBlocked: boolean
  showPricing: boolean
  locale: AnalystTrustLocale
  trustView: AnalystTrustView | null
  sportLabel: string
  listRecommendationLabel: string
  detailRecommendationLabel: string
  actionLabel: string
}

const SUPPORTED_SPORT_MODULES = new Set(['soccer', 'tennis', 'cs2'])
const NOT_ACTIONABLE_FIXTURE_STATUSES = new Set<FixtureStatus>([
  'live',
  'finished',
  'cancelled',
  'abandoned',
  'postponed',
  'retired',
  'walkover',
  'not_bettable',
])

const PARLAY_TERMS = [
  'express',
  'parlay',
  'multi',
  'combo',
  'accumulator',
  'экспресс',
  'експрес',
]

const TENNIS_TERMS = [
  'tennis',
  'atp',
  'wta',
  'wimbledon',
  'sinner',
  'djokovic',
  'alcaraz',
  'de minaur',
  'svajda',
  'medvedev',
]

const FOOTBALL_TERMS = [
  'football',
  'soccer',
  'match result',
  'перерва',
  'halftime',
]

interface CouponLiveSignal {
  isLive: boolean
  periodOrPhase: string | null
  statusText: string | null
  statusSource: CouponStatusSource
  statusConfidence: number | null
}

function cleanSport(sport: string | null | undefined): string {
  return (sport ?? 'other').toLowerCase().trim() || 'other'
}

function resolveFixtureStatus(status: FixtureStatus | null | undefined): FixtureStatus {
  return status ?? 'unknown'
}

function actionabilityForFixtureStatus(status: FixtureStatus): AnalysisActionability {
  if (status === 'unknown') return 'status_unverified'
  if (NOT_ACTIONABLE_FIXTURE_STATUSES.has(status)) return 'not_actionable'
  return 'actionable'
}

function actionabilityForLeg(leg: AnalysisLegQualityInput, status: FixtureStatus): AnalysisActionability {
  if (leg.actionability) return leg.actionability
  if (leg.isLive || (status === 'live' && leg.statusSource === 'coupon')) return 'live_not_supported'
  return actionabilityForFixtureStatus(status)
}

function hasValidProbability(value: number | null | undefined): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100
}

function coverageValue(
  legCoverage: AnalysisDataCoverage | undefined,
  rootCoverage: AnalysisDataCoverage | undefined,
  key: keyof AnalysisDataCoverage,
  webSearchEnabled: boolean
): boolean {
  return legCoverage?.[key] ?? rootCoverage?.[key] ?? webSearchEnabled
}

function isParlayLike(input: AnalysisQualityGateInput): boolean {
  const text = [
    input.marketType,
    input.eventName,
    input.selection ?? '',
    input.notes ?? '',
  ].join(' ').toLowerCase()

  return PARLAY_TERMS.some(term => text.includes(term)) ||
    /\s\+\s/.test(input.eventName) ||
    /\s\+\s/.test(input.selection ?? '')
}

function detectCouponLiveSignal(text: string): CouponLiveSignal {
  const setMatch = text.match(/(?:^|[\s,])([1-5]-й\s+сет)(?=$|[\s,])/i) ??
    text.match(/(?:^|[\s,])([1-5](?:st|nd|rd|th)\s+set)(?=$|[\s,])/i)
  if (setMatch?.[1]) {
    return {
      isLive: true,
      periodOrPhase: setMatch[1].trim(),
      statusText: setMatch[1].trim(),
      statusSource: 'coupon',
      statusConfidence: 0.95,
    }
  }

  const halftimeMatch = text.match(/перерва/i) ?? text.match(/halftime/i)
  if (halftimeMatch?.[0]) {
    return {
      isLive: true,
      periodOrPhase: halftimeMatch[0].trim(),
      statusText: halftimeMatch[0].trim(),
      statusSource: 'coupon',
      statusConfidence: 0.95,
    }
  }

  const liveMatch = text.match(/лайв/i) ?? text.match(/\blive\b/i) ?? text.match(/\bin-play\b/i)
  if (liveMatch?.[0]) {
    return {
      isLive: true,
      periodOrPhase: null,
      statusText: liveMatch[0].trim(),
      statusSource: 'coupon',
      statusConfidence: 0.9,
    }
  }

  return {
    isLive: false,
    periodOrPhase: null,
    statusText: null,
    statusSource: 'unknown',
    statusConfidence: null,
  }
}

function stripLeadingLivePhase(text: string, phase: string | null): string {
  if (!phase) return text.trim()
  const escaped = phase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return text.replace(new RegExp(`^\\s*${escaped}\\s*,?\\s*`, 'i'), '').trim()
}

function detectSportFromText(text: string, fallback: string, allowFallback = true): string {
  const normalized = text.toLowerCase()
  if (/(?:^|[\s,])[1-5]-й\s+сет(?:$|[\s,])/.test(normalized)) return 'tennis'
  if (/(?:^|[\s,])[1-5](?:st|nd|rd|th)\s+set(?:$|[\s,])/.test(normalized)) return 'tennis'
  if (TENNIS_TERMS.some(term => normalized.includes(term))) return 'tennis'
  if (FOOTBALL_TERMS.some(term => normalized.includes(term))) return 'soccer'
  return allowFallback ? fallback : 'other'
}

function enrichLegFromCouponText(
  leg: AnalysisLegQualityInput & { label: string },
  primarySport: string,
  allowSportFallback: boolean
): AnalysisLegQualityInput & { label: string } {
  const rawText = leg.rawText ?? leg.eventName ?? ''
  const liveSignal = detectCouponLiveSignal([
    rawText,
    leg.eventName ?? '',
    leg.marketType ?? '',
    leg.selection ?? '',
  ].join(' '))
  const isLive = leg.isLive ?? liveSignal.isLive
  const periodOrPhase = leg.periodOrPhase ?? liveSignal.periodOrPhase
  const statusText = leg.statusText ?? liveSignal.statusText
  const statusSource = leg.statusSource ?? liveSignal.statusSource
  const statusConfidence = leg.statusConfidence ?? liveSignal.statusConfidence
  const eventName = leg.eventName ? stripLeadingLivePhase(leg.eventName, periodOrPhase) : leg.eventName
  const sport = leg.sport
    ? cleanSport(leg.sport)
    : detectSportFromText(`${rawText} ${eventName ?? ''} ${leg.selection ?? ''}`, primarySport, allowSportFallback)

  return {
    ...leg,
    rawText,
    sport,
    eventName,
    isLive,
    periodOrPhase,
    statusText,
    statusSource,
    statusConfidence,
    fixtureStatus: leg.fixtureStatus ?? (isLive ? 'live' : undefined),
    sportModuleSupport: leg.sportModuleSupport ?? (
      sport === 'other' ? 'none' : sport === primarySport ? undefined : 'approximate'
    ),
  }
}

function inferLegs(input: AnalysisQualityGateInput): Array<AnalysisLegQualityInput & { label: string }> {
  if (input.legs && input.legs.length > 0) {
    return input.legs.map((leg, index) => enrichLegFromCouponText(
      { ...leg, label: leg.label ?? `Leg ${index + 1}` },
      cleanSport(input.sport),
      false
    ))
  }

  const primarySport = cleanSport(input.sport)
  if (!isParlayLike(input)) {
    return [enrichLegFromCouponText({
      label: 'Leg 1',
      sport: primarySport,
      eventName: input.eventName,
      marketType: input.marketType,
      selection: input.selection ?? null,
      modelProbability: input.modelProbability ?? null,
      sportModuleSupport: input.sportModuleSupport,
      dataCoverage: input.dataCoverage,
    }, primarySport, true)]
  }

  const eventParts = input.eventName.split(/\s+\+\s+/).map(part => part.trim()).filter(Boolean)
  const selectionParts = (input.selection ?? '').split(/\s+\+\s+/).map(part => part.trim())
  const parts = eventParts.length > 1 ? eventParts : [input.eventName]

  return parts.map((eventName, index) => {
    const selection = selectionParts[index] || null
    const liveSignal = detectCouponLiveSignal(`${eventName} ${selection ?? ''}`)
    const sport = detectSportFromText(`${eventName} ${selection ?? ''}`, primarySport, !liveSignal.isLive)
    return enrichLegFromCouponText({
      label: `Leg ${index + 1}`,
      rawText: eventName,
      sport,
      eventName,
      marketType: input.marketType,
      selection,
      modelProbability: null,
      sportModuleSupport: sport === primarySport ? input.sportModuleSupport : 'approximate',
      dataCoverage: input.dataCoverage,
    }, primarySport, !liveSignal.isLive)
  })
}

function resolveSportSupport(
  primarySport: string,
  legSport: string,
  explicit: SportModuleSupport | undefined
): SportModuleSupport {
  if (explicit) return explicit
  if (legSport !== primarySport) return 'approximate'
  return SUPPORTED_SPORT_MODULES.has(legSport) ? 'full' : 'none'
}

function supportLevelFromSportSupport(support: SportModuleSupport): LegSupportLevel {
  if (support === 'full') return 'full'
  if (support === 'approximate') return 'approximate'
  return 'unsupported'
}

function addMissing(missing: string[], item: string) {
  if (!missing.includes(item)) missing.push(item)
}

export function evaluateAnalysisQuality(input: AnalysisQualityGateInput): AnalysisQualityGateResult {
  const primarySport = cleanSport(input.sport)
  const parlay = isParlayLike(input)
  const legs = inferLegs(input)
  const uniqueSports = new Set<string>()
  const missingDataByLeg: MissingDataByLeg[] = []
  const reasons = new Set<string>()
  let topLevelActionability: AnalysisActionability = 'actionable'

  let checks = 0
  let covered = 0

  for (const [index, leg] of legs.entries()) {
    const legSport = cleanSport(leg.sport)
    uniqueSports.add(legSport)

    const support = resolveSportSupport(primarySport, legSport, leg.sportModuleSupport)
    const supportLevel = supportLevelFromSportSupport(support)
    const fixtureStatus = resolveFixtureStatus(leg.fixtureStatus ?? input.fixtureStatus)
    const actionability = actionabilityForLeg(leg, fixtureStatus)
    const missing: string[] = []

    if (actionability === 'live_not_supported') {
      topLevelActionability = 'live_not_supported'
    } else if (actionability === 'not_actionable' && topLevelActionability !== 'live_not_supported') {
      topLevelActionability = 'not_actionable'
    } else if (actionability === 'status_unverified' && topLevelActionability === 'actionable') {
      topLevelActionability = 'status_unverified'
    }

    const coverageChecks: Array<[keyof AnalysisDataCoverage, string]> = [
      ['liveInjuries', 'live injuries'],
      ['teamNews', 'team news'],
      ['recentForm', 'recent form updates'],
      ['lineMovement', 'current line movement'],
    ]

    for (const [key, label] of coverageChecks) {
      checks++
      if (coverageValue(leg.dataCoverage, input.dataCoverage, key, input.webSearchEnabled)) {
        covered++
      } else {
        addMissing(missing, label)
      }
    }

    checks++
    if (fixtureStatus !== 'unknown') {
      covered++
    } else {
      addMissing(missing, 'event start time / fixture status')
      reasons.add('Fixture status must be verified before pricing.')
    }

    if (actionability === 'not_actionable') {
      addMissing(missing, 'event actionability')
      reasons.add('Event has already started, finished, or is not currently bettable.')
    }

    if (actionability === 'live_not_supported') {
      addMissing(missing, 'current score')
      addMissing(missing, 'set/game/minute')
      addMissing(missing, 'live odds movement')
      addMissing(missing, 'provider-backed live status')
      reasons.add('Live coupon requires a provider-backed live analysis module before pricing.')
    }

    checks++
    if (support === 'full') {
      covered++
    } else {
      addMissing(missing, 'sport-specific support confirmed for this leg')
      reasons.add('Every leg requires sport-specific support before pricing.')
    }

    if (legSport === 'tennis' && support !== 'full') {
      addMissing(missing, 'tennis module unavailable or approximate')
      reasons.add('Tennis leg requires a full tennis module before EV calculation.')
    }

    checks++
    if (parlay) {
      if (hasValidProbability(leg.modelProbability)) {
        covered++
      } else {
        addMissing(missing, 'per-leg model probability')
        reasons.add('Parlays require per-leg probability before combined probability.')
      }
    } else if (input.modelInputsPresent && hasValidProbability(input.modelProbability)) {
      covered++
    } else {
      addMissing(missing, 'actual model inputs backing model probability')
      reasons.add('Model probability requires actual model inputs.')
    }

    if (missing.length > 0) {
      missingDataByLeg.push({
        legLabel: leg.label ?? `Leg ${index + 1}`,
        legNumber: index + 1,
        sport: legSport,
        eventName: leg.eventName ?? null,
        marketType: leg.marketType ?? input.marketType ?? null,
        selection: leg.selection ?? null,
        rawText: leg.rawText ?? null,
        odds: leg.odds ?? null,
        isLive: leg.isLive ?? false,
        periodOrPhase: leg.periodOrPhase ?? null,
        statusText: leg.statusText ?? null,
        scoreText: leg.scoreText ?? null,
        statusSource: leg.statusSource ?? 'unknown',
        statusConfidence: leg.statusConfidence ?? null,
        fixtureStatus,
        actionability,
        supportLevel,
        missing,
      })
    }
  }

  if (uniqueSports.size > 1) {
    reasons.add('Mixed-sport parlay requires sport-specific support for every leg.')
  }

  const hasUnsupportedSport = missingDataByLeg.some(leg =>
    leg.missing.some(item =>
      item.includes('sport-specific support') ||
      item.includes('tennis module')
    )
  )
  const pricingAllowed = missingDataByLeg.length === 0 && reasons.size === 0 && topLevelActionability === 'actionable'
  const dataCoverageScore = checks === 0 ? 0 : Math.round((covered / checks) * 100)

  if (pricingAllowed) {
    return {
      status: 'priced',
      label: 'PRICED BETTING ANALYSIS',
      supportLabel: 'Priced betting analysis',
      pricingAllowed: true,
      dataCoverageScore,
      missingDataByLeg: [],
      suppressedPricingFields: [],
      reasons: [],
      analysisType: 'priced_betting_analysis',
      actionability: 'actionable',
    }
  }

  const isMixedSport = uniqueSports.size > 1
  const hasUnsupportedLiveCoupon = topLevelActionability === 'live_not_supported'
  const status: AnalysisQualityStatus = hasUnsupportedLiveCoupon || isMixedSport || hasUnsupportedSport ? 'unsupported' : 'insufficient_data'
  const label = hasUnsupportedLiveCoupon
    ? 'LIVE COUPON - live analysis unavailable'
    : topLevelActionability === 'not_actionable'
    ? 'NOT ACTIONABLE - event already started or finished'
    : status === 'unsupported'
    ? (isMixedSport ? 'NO PRICE - unsupported mixed-sport parlay' : 'NO PRICE - unsupported / partially supported bet')
    : 'INSUFFICIENT DATA'

  return {
    status,
    label,
    supportLabel: 'Unsupported / partially supported bet',
    pricingAllowed: false,
    dataCoverageScore,
    missingDataByLeg,
    suppressedPricingFields: ['model_probability', 'implied_probability', 'edge_percent'],
    reasons: [...reasons],
    analysisType: 'risk_warning',
    actionability: topLevelActionability,
  }
}

const TRUST_LABELS = {
  en: {
    riskWarning: 'Risk warning',
    dataCoverage: 'Data coverage',
    missingDataChecklist: 'Missing data checklist',
    confidence: 'Confidence',
    factorAnalysis: 'Factor Analysis',
    downloadPdf: 'Download PDF',
    copyToShare: 'Copy to share',
    copied: 'Copied',
    watch: 'Watch',
    skip: 'Skip',
    placeBet: 'Place Bet',
    uiDisclaimer: 'This analysis is based only on the information provided and does not include live injuries, team news, recent form updates, or current line movement.',
    riskDisclaimer: 'This is a risk warning, not a priced betting analysis.',
    footerDisclaimer: 'Analysis is for informational purposes only',
    shareHeader: 'Risk warning',
    pdfHeader: 'BetTracker AI analysis',
    pdfFooter: 'Analysis is for informational purposes only',
    generated: 'Generated',
    via: 'via BetTracker AI',
    availableActions: 'Available actions',
    noPrice: 'NO PRICE',
    insufficientData: 'INSUFFICIENT DATA',
    unsupportedMixedSportParlay: 'unsupported mixed-sport parlay',
    unsupportedPartial: 'Unsupported / partially supported bet',
    liveCoupon: 'LIVE COUPON',
    liveAnalysisUnavailable: 'live analysis unavailable',
    notActionable: 'NOT ACTIONABLE',
    eventStartedOrFinished: 'event already started or finished',
    safeExplanationBlocked: 'Price is unavailable because the coupon does not have enough verified data coverage for every leg.',
    safeExplanationUnsupported: 'Price is unavailable because this parlay contains unsupported or only partially supported legs.',
    safeExplanationUnverified: 'Price is unavailable because event status is unverified and the coupon is missing required per-leg data.',
    safeExplanationNotActionable: 'This coupon is not actionable because at least one event has already started, finished, or is not currently bettable.',
    safeExplanationLive: 'This coupon contains live events. The current module supports only static pre-match risk review, so live pricing is unavailable without current score, set/game/minute, live odds movement, and provider-backed live status.',
    safeNextSteps: [
      'Verify the start time and fixture status for every leg.',
      'Add current team news, injury context, recent form, and line movement.',
      'Confirm full sport-specific support for every leg before pricing.',
    ],
    safeNextStepsLive: [
      'Use a provider-backed live module before pricing this coupon.',
      'Add current score, set/game/minute, and live odds movement for every leg.',
      'Confirm live status from a trusted provider before any value calculation.',
    ],
    leg: 'Leg',
    sport: 'Sport',
    event: 'Event',
    marketSelection: 'Market / selection',
    odds: 'Odds',
    fixtureStatus: 'Fixture status',
    periodOrPhase: 'Period / phase',
    statusSource: 'Status source',
    statusDetectedFromCoupon: 'status detected from coupon',
    supportLevel: 'Support level',
    actionability: 'Actionability',
    safeFactorCoverage: 'Data coverage',
    safeFactorSupport: 'Leg support',
    safeFactorActionability: 'Event actionability',
    noMissingData: 'No missing data listed',
    sports: {
      soccer: 'soccer',
      tennis: 'tennis',
      cs2: 'CS2',
      basketball: 'basketball',
      ice_hockey: 'ice hockey',
      mma: 'MMA',
      other: 'other',
    },
    fixtureStatuses: {
      scheduled: 'scheduled',
      unknown: 'status unverified',
      live: 'live',
      finished: 'finished',
      cancelled: 'cancelled',
      abandoned: 'abandoned',
      postponed: 'postponed',
      retired: 'retired',
      walkover: 'walkover',
      not_bettable: 'not bettable',
    },
    actionabilityLabels: {
      actionable: 'actionable',
      status_unverified: 'status unverified',
      not_actionable: 'not actionable',
      live_not_supported: 'live analysis not supported',
    },
    supportLabels: {
      full: 'full',
      approximate: 'approximate',
      unsupported: 'unsupported',
    },
    missing: {
      'live injuries': 'live injuries',
      'team news': 'team news',
      'recent form updates': 'recent form updates',
      'current line movement': 'current line movement',
      'sport-specific support confirmed for this leg': 'sport-specific support confirmed for this leg',
      'tennis module unavailable or approximate': 'tennis module unavailable or approximate',
      'per-leg model probability': 'per-leg model inputs',
      'actual model inputs backing model probability': 'actual model inputs',
      'event start time / fixture status': 'event start time / fixture status',
      'event actionability': 'event actionability',
      'current score': 'current score',
      'set/game/minute': 'set/game/minute',
      'live odds movement': 'live odds movement',
      'provider-backed live status': 'provider-backed live status',
    },
  },
  uk: {
    riskWarning: 'Попередження про ризик',
    dataCoverage: 'Покриття даних',
    missingDataChecklist: 'Перелік відсутніх даних',
    confidence: 'Впевненість',
    factorAnalysis: 'Фактори ризику',
    downloadPdf: 'Завантажити PDF',
    copyToShare: 'Скопіювати для поширення',
    copied: 'Скопійовано',
    watch: 'Спостерігати',
    skip: 'Пропустити',
    placeBet: 'Зробити ставку',
    uiDisclaimer: 'Цей аналіз базується лише на наданій інформації та не містить перевірених даних про травми, склади, форму команд, рух лінії або актуальний статус подій.',
    riskDisclaimer: 'Це попередження про ризик, а не оцінений аналіз ставки.',
    footerDisclaimer: 'Аналіз лише для інформаційної підтримки',
    shareHeader: 'Попередження про ризик',
    pdfHeader: 'Аналіз BetTracker AI',
    pdfFooter: 'Аналіз лише для інформаційної підтримки',
    generated: 'Згенеровано',
    via: 'через BetTracker AI',
    availableActions: 'Доступні дії',
    noPrice: 'БЕЗ ОЦІНКИ',
    insufficientData: 'НЕДОСТАТНЬО ДАНИХ',
    unsupportedMixedSportParlay: 'непідтримуваний експрес із різних видів спорту',
    unsupportedPartial: 'Ставка не підтримується або підтримується частково',
    liveCoupon: 'ЛАЙВ-КУПОН',
    liveAnalysisUnavailable: 'live-аналіз недоступний',
    notActionable: 'НЕАКТУАЛЬНО',
    eventStartedOrFinished: 'подія вже почалась або завершилась',
    safeExplanationBlocked: 'Оцінка недоступна, бо для купона бракує перевіреного покриття даних по кожній нозі.',
    safeExplanationUnsupported: 'Оцінка недоступна, бо експрес містить непідтримувані або частково підтримувані ноги.',
    safeExplanationUnverified: 'Оцінка недоступна, бо статус подій не перевірено і бракує обов’язкових даних по ногах.',
    safeExplanationNotActionable: 'Купон неактуальний, бо одна або більше подій уже почалась, завершилась або недоступна для ставки.',
    safeExplanationLive: 'Цей купон містить live-події. Поточний модуль підтримує лише статичний pre-match огляд ризику; для live-оцінки потрібні поточний рахунок, сет/гейм/хвилина, рух live-лінії та підтверджений провайдером live-статус.',
    safeNextSteps: [
      'Перевірити час початку та статус кожної події.',
      'Додати актуальні новини команд, травми, поточну форму та рух лінії.',
      'Підтвердити повну підтримку спортивного модуля для кожної ноги.',
    ],
    safeNextStepsLive: [
      'Використати провайдерський live-модуль перед оцінкою цього купона.',
      'Додати поточний рахунок, сет/гейм/хвилину та рух live-лінії для кожної ноги.',
      'Підтвердити live-статус у надійного провайдера перед будь-яким розрахунком цінності.',
    ],
    leg: 'Нога',
    sport: 'Спорт',
    event: 'Подія',
    marketSelection: 'Ринок / вибір',
    odds: 'Коефіцієнт',
    fixtureStatus: 'Статус матчу',
    periodOrPhase: 'Період / фаза',
    statusSource: 'Джерело статусу',
    statusDetectedFromCoupon: 'статус визначено з купона',
    supportLevel: 'Рівень підтримки',
    actionability: 'Актуальність',
    safeFactorCoverage: 'Покриття даних',
    safeFactorSupport: 'Підтримка ніг',
    safeFactorActionability: 'Актуальність події',
    noMissingData: 'Відсутні дані не вказані',
    sports: {
      soccer: 'футбол',
      tennis: 'теніс',
      cs2: 'CS2',
      basketball: 'баскетбол',
      ice_hockey: 'хокей',
      mma: 'MMA',
      other: 'інше',
    },
    fixtureStatuses: {
      scheduled: 'заплановано',
      unknown: 'статус не перевірено',
      live: 'наживо',
      finished: 'завершено',
      cancelled: 'скасовано',
      abandoned: 'перервано',
      postponed: 'відкладено',
      retired: 'знято з гри',
      walkover: 'технічна перемога',
      not_bettable: 'недоступно для ставки',
    },
    actionabilityLabels: {
      actionable: 'можна розглядати',
      status_unverified: 'статус не перевірено',
      not_actionable: 'неактуально',
      live_not_supported: 'live-аналіз не підтримується',
    },
    supportLabels: {
      full: 'повна підтримка',
      approximate: 'приблизна підтримка',
      unsupported: 'не підтримується',
    },
    missing: {
      'live injuries': 'актуальні травми',
      'team news': 'новини команд',
      'recent form updates': 'оновлення поточної форми',
      'current line movement': 'поточний рух лінії',
      'sport-specific support confirmed for this leg': 'підтверджена підтримка виду спорту для цієї ноги',
      'tennis module unavailable or approximate': 'тенісний модуль недоступний або лише приблизний',
      'per-leg model probability': 'модельні вхідні дані для кожної ноги',
      'actual model inputs backing model probability': 'фактичні модельні вхідні дані',
      'event start time / fixture status': 'час початку події / статус матчу',
      'event actionability': 'актуальність події для ставки',
      'current score': 'поточний рахунок',
      'set/game/minute': 'сет/гейм/хвилина',
      'live odds movement': 'рух live-лінії',
      'provider-backed live status': 'підтверджений провайдером live-статус',
    },
  },
} as const

function normalizeTrustLocale(locale: string | null | undefined): AnalystTrustLocale {
  return locale === 'uk' ? 'uk' : 'en'
}

export function localizeAnalystTrustSport(sport: string | null | undefined, locale: AnalystTrustLocale): string {
  const labels = TRUST_LABELS[locale]
  const normalized = cleanSport(sport)
  return labels.sports[normalized as keyof typeof labels.sports] ?? normalized
}

const DECISION_RECOMMENDATION_LABELS: Record<string, string> = {
  bet: 'BET',
  watch: 'WATCH',
  skip: 'SKIP',
  no_value: 'NO VALUE',
}

const DECISION_ACTION_LABELS = {
  en: {
    pending: 'Pending',
    placed: 'Placed',
    skipped: 'Skipped',
    watchlisted: 'Watchlisted',
    ignored: 'Ignored',
  },
  uk: {
    pending: 'Очікує рішення',
    placed: 'Розміщено',
    skipped: 'Пропущено',
    watchlisted: 'Під спостереженням',
    ignored: 'Ігноровано',
  },
} as const

function localizeDecisionAction(action: string | null | undefined, locale: AnalystTrustLocale): string {
  const normalized = action ?? 'pending'
  const labels = DECISION_ACTION_LABELS[locale]
  return labels[normalized as keyof typeof labels] ?? normalized
}

function compactTrustLabel(view: AnalystTrustView): string {
  return view.label.split(' - ')[0] ?? view.label
}

function hasUkrainianDecisionText(input: AnalystDecisionSurfaceInput): boolean {
  return /[А-Яа-яІіЇїЄєҐґ]/.test([
    input.eventName,
    input.marketType,
    input.selection,
  ].filter(Boolean).join(' '))
}

function shouldUseBlockedDecisionSurface(input: AnalystDecisionSurfaceInput, showPricing: boolean): boolean {
  const gateBlocksPricing = input.qualityGate?.pricingAllowed === false ||
    input.qualityGate?.analysisType === 'risk_warning'
  const recommendationIsUnpriced = input.recommendation === 'no_value' ||
    input.recommendation === 'no_price'

  return Boolean(
    gateBlocksPricing ||
    input.edgeBucket === 'unpriced' ||
    (recommendationIsUnpriced && !showPricing)
  )
}

function inferDecisionSurfaceLocale(
  input: AnalystDecisionSurfaceInput,
  shouldBlockSurface: boolean
): AnalystTrustLocale {
  if (shouldBlockSurface && hasUkrainianDecisionText(input)) return 'uk'
  if (input.locale) return normalizeTrustLocale(input.locale)
  return input.trustView?.locale ?? normalizeTrustLocale(input.locale)
}

function buildFallbackDecisionQualityGate(input: AnalystDecisionSurfaceInput): AnalysisQualityGateResult {
  return evaluateAnalysisQuality({
    sport:             input.sport ?? 'other',
    eventName:         input.eventName,
    marketType:        input.marketType,
    selection:         input.selection,
    webSearchEnabled:  false,
    modelProbability:  input.modelProbability,
  })
}

function localizedQualityGateLabel(result: AnalysisQualityGateResult, locale: AnalystTrustLocale): string {
  const labels = TRUST_LABELS[locale]
  if (result.label === 'PRICED BETTING ANALYSIS') return locale === 'uk' ? 'ОЦІНЕНИЙ АНАЛІЗ СТАВКИ' : 'PRICED BETTING ANALYSIS'
  if (result.label === 'LIVE COUPON - live analysis unavailable') {
    return locale === 'uk'
      ? 'ЛАЙВ-КУПОН — оцінка недоступна без live-даних'
      : `${labels.liveCoupon} - ${labels.liveAnalysisUnavailable}`
  }
  if (result.label === 'INSUFFICIENT DATA') return labels.insufficientData
  if (result.label === 'NO PRICE - unsupported mixed-sport parlay') {
    return `${labels.noPrice} - ${labels.unsupportedMixedSportParlay}`
  }
  if (result.label === 'NOT ACTIONABLE - event already started or finished') {
    return `${labels.notActionable} - ${labels.eventStartedOrFinished}`
  }
  return `${labels.noPrice} - ${labels.unsupportedPartial}`
}

function localizedSupportLabel(result: AnalysisQualityGateResult, locale: AnalystTrustLocale): string {
  if (result.supportLabel === 'Priced betting analysis') {
    return locale === 'uk' ? 'Оцінений аналіз ставки' : 'Priced betting analysis'
  }
  if (result.label === 'LIVE COUPON - live analysis unavailable') return TRUST_LABELS[locale].liveAnalysisUnavailable
  return TRUST_LABELS[locale].unsupportedPartial
}

function localizedMissingItem(item: string, locale: AnalystTrustLocale): string {
  const labels = TRUST_LABELS[locale]
  return labels.missing[item as keyof typeof labels.missing] ?? item
}

function inferSafeExplanation(result: AnalysisQualityGateResult, locale: AnalystTrustLocale): string {
  const labels = TRUST_LABELS[locale]
  if (result.actionability === 'live_not_supported') return labels.safeExplanationLive
  if (result.actionability === 'not_actionable') return labels.safeExplanationNotActionable
  if (result.actionability === 'status_unverified') return labels.safeExplanationUnverified
  if (result.status === 'unsupported') return labels.safeExplanationUnsupported
  return labels.safeExplanationBlocked
}

function buildDeterministicFactors(view: Pick<AnalystTrustView, 'locale' | 'dataCoverageScore' | 'legs' | 'actionabilityLabel'>): AnalystTrustFactor[] {
  const labels = TRUST_LABELS[view.locale]
  const missingCount = view.legs.reduce((sum, leg) => sum + leg.missingData.length, 0)
  const unsupportedCount = view.legs.filter(leg => leg.supportLevel !== 'full').length

  return [
    {
      name: labels.safeFactorCoverage,
      score: missingCount === 0 ? 0 : -2,
      detail: view.locale === 'uk'
        ? `${labels.dataCoverage}: ${view.dataCoverageScore}/100. ${labels.missingDataChecklist}: ${missingCount}.`
        : `${labels.dataCoverage}: ${view.dataCoverageScore}/100. ${labels.missingDataChecklist}: ${missingCount}.`,
    },
    {
      name: labels.safeFactorSupport,
      score: unsupportedCount === 0 ? 0 : -2,
      detail: view.locale === 'uk'
        ? `Ноги з неповною підтримкою: ${unsupportedCount}.`
        : `Legs without full support: ${unsupportedCount}.`,
    },
    {
      name: labels.safeFactorActionability,
      score: view.actionabilityLabel === labels.actionabilityLabels.actionable ? 0 : -2,
      detail: `${labels.actionability}: ${view.actionabilityLabel}.`,
    },
  ]
}

export function buildAnalystTrustView(input: BuildAnalystTrustViewInput): AnalystTrustView {
  const locale = normalizeTrustLocale(input.locale)
  const labels = TRUST_LABELS[locale]
  const result = input.qualityGate
  const resultActionability = result.actionability ?? (result.pricingAllowed ? 'actionable' : 'status_unverified')
  const showRawAiAnalysis = result.pricingAllowed
  const showPlaceBet = result.pricingAllowed && resultActionability === 'actionable'
  const showWatch = resultActionability !== 'not_actionable' && resultActionability !== 'live_not_supported'
  const fallbackLeg: MissingDataByLeg = {
    legLabel: 'Leg 1',
    legNumber: 1,
    sport: 'other',
    eventName: input.eventName,
    marketType: input.marketType,
    selection: input.selection ?? null,
    fixtureStatus: 'unknown',
    actionability: 'status_unverified',
    supportLevel: 'unsupported',
    missing: ['event start time / fixture status'],
  }
  const gateLegs = result.missingDataByLeg.length > 0 ? result.missingDataByLeg : [fallbackLeg]
  const legs: AnalystTrustLeg[] = gateLegs.map((leg, index) => {
    const sport = leg.sport || 'other'
    const fixtureStatus = leg.fixtureStatus ?? 'unknown'
    const actionability = leg.actionability ?? actionabilityForFixtureStatus(fixtureStatus)
    const supportLevel = leg.supportLevel ?? 'unsupported'

    return {
      legLabel: `${labels.leg} ${leg.legNumber ?? index + 1}`,
      legNumber: leg.legNumber ?? index + 1,
      sport,
      sportLabel: labels.sports[sport as keyof typeof labels.sports] ?? sport,
      eventName: leg.eventName ?? input.eventName,
      marketType: leg.marketType ?? input.marketType,
      selection: leg.selection ?? input.selection ?? null,
      rawText: leg.rawText ?? null,
      odds: leg.odds ?? null,
      isLive: leg.isLive ?? fixtureStatus === 'live',
      periodOrPhase: leg.periodOrPhase ?? null,
      statusText: leg.statusText ?? null,
      scoreText: leg.scoreText ?? null,
      statusSource: leg.statusSource ?? 'unknown',
      statusSourceLabel: leg.statusSource === 'coupon'
        ? labels.statusDetectedFromCoupon
        : leg.statusSource === 'provider'
        ? 'provider'
        : null,
      statusConfidence: leg.statusConfidence ?? null,
      fixtureStatus,
      fixtureStatusLabel: leg.statusSource === 'coupon'
        ? labels.statusDetectedFromCoupon
        : labels.fixtureStatuses[fixtureStatus],
      actionability,
      actionabilityLabel: labels.actionabilityLabels[actionability],
      supportLevel,
      supportLabel: labels.supportLabels[supportLevel],
      missingData: leg.missing.map(item => localizedMissingItem(item, locale)),
    }
  })

  const viewBase = {
    locale,
    label: localizedQualityGateLabel(result, locale),
    supportLabel: localizedSupportLabel(result, locale),
    riskWarningLabel: labels.riskWarning,
    dataCoverageLabel: labels.dataCoverage,
    missingDataChecklistLabel: labels.missingDataChecklist,
    confidenceLabel: labels.confidence,
    factorAnalysisLabel: labels.factorAnalysis,
    downloadPdfLabel: labels.downloadPdf,
    copyToShareLabel: labels.copyToShare,
    copiedLabel: labels.copied,
    watchLabel: labels.watch,
    skipLabel: labels.skip,
    placeBetLabel: labels.placeBet,
    uiDisclaimer: labels.uiDisclaimer,
    riskDisclaimer: labels.riskDisclaimer,
    footerDisclaimer: labels.footerDisclaimer,
    shareHeader: labels.shareHeader,
    pdfHeader: labels.pdfHeader,
    pdfFooter: labels.pdfFooter,
    generatedLabel: labels.generated,
    viaLabel: labels.via,
    dataCoverageScore: result.dataCoverageScore,
    actionability: resultActionability,
    actionabilityLabel: labels.actionabilityLabels[resultActionability],
    safeExplanation: inferSafeExplanation(result, locale),
    safeNextSteps: resultActionability === 'live_not_supported' ? [...labels.safeNextStepsLive] : [...labels.safeNextSteps],
    legs,
    showPlaceBet,
    showWatch,
    showSkip: true,
    showRawAiAnalysis,
  }

  const displayReasoning = showRawAiAnalysis
    ? input.rawReasoning ?? ''
    : viewBase.safeExplanation
  const displayFactors = showRawAiAnalysis
    ? input.rawFactors ?? []
    : buildDeterministicFactors(viewBase)

  return {
    ...viewBase,
    displayReasoning,
    displayFactors,
  }
}

export function renderAnalystTrustSummaryText(view: AnalystTrustView): string {
  const labels = TRUST_LABELS[view.locale]
  const lines = [
    view.riskWarningLabel,
    view.label,
    view.supportLabel,
    `${view.dataCoverageLabel}: ${view.dataCoverageScore}/100`,
    `${labels.actionability}: ${view.actionabilityLabel}`,
    '',
    view.safeExplanation,
    '',
    view.missingDataChecklistLabel,
  ]

  for (const leg of view.legs) {
    lines.push(`${leg.legLabel}`)
    lines.push(`${labels.sport}: ${leg.sportLabel}`)
    lines.push(`${labels.event}: ${leg.eventName}`)
    lines.push(`${labels.marketSelection}: ${leg.marketType}${leg.selection ? ` / ${leg.selection}` : ''}`)
    if (leg.odds != null) lines.push(`${labels.odds}: ${leg.odds}`)
    lines.push(`${labels.fixtureStatus}: ${leg.fixtureStatusLabel}`)
    if (leg.statusSourceLabel) lines.push(`${labels.statusSource}: ${leg.statusSourceLabel}`)
    if (leg.periodOrPhase) lines.push(`${labels.periodOrPhase}: ${leg.periodOrPhase}`)
    if (leg.scoreText) lines.push(`Score: ${leg.scoreText}`)
    lines.push(`${labels.supportLevel}: ${leg.supportLabel}`)
    lines.push(`${labels.actionability}: ${leg.actionabilityLabel}`)
    if (leg.missingData.length > 0) {
      for (const item of leg.missingData) lines.push(`- ${item}`)
    } else {
      lines.push(`- ${labels.noMissingData}`)
    }
  }

  lines.push('')
  lines.push(...view.safeNextSteps.map(step => `- ${step}`))

  return lines.join('\n')
}

function renderAnalystTrustMetaLine(view: AnalystTrustView, context: AnalystTrustRenderContext): string {
  const parts = [
    localizeAnalystTrustSport(context.sport, view.locale),
    context.marketType,
    context.selection,
    context.offeredOdds != null ? `@${context.offeredOdds}` : null,
    context.bookmaker,
  ]

  return parts.filter(Boolean).join(' · ')
}

function renderAnalystTrustActions(view: AnalystTrustView): string[] {
  return [
    view.showPlaceBet ? view.placeBetLabel : null,
    view.showWatch ? view.watchLabel : null,
    view.showSkip ? view.skipLabel : null,
  ].filter((value): value is string => Boolean(value))
}

function renderAnalystTrustGeneratedDate(value: Date | string | null | undefined): string {
  if (!value) return new Date().toLocaleDateString()
  if (value instanceof Date) return value.toLocaleDateString()
  return value
}

export function renderAnalystTrustShareText(view: AnalystTrustView, context: AnalystTrustRenderContext): string {
  const labels = TRUST_LABELS[view.locale]
  const actions = renderAnalystTrustActions(view)
  const lines = [
    `${view.shareHeader} - ${context.eventName}`,
    renderAnalystTrustMetaLine(view, context),
    '',
    view.label,
    renderAnalystTrustSummaryText(view),
    `${view.confidenceLabel}: ${view.dataCoverageScore}/100 | ${view.actionabilityLabel}`,
    actions.length > 0 ? `${labels.availableActions}: ${actions.join(' / ')}` : null,
    '',
    view.uiDisclaimer,
    view.footerDisclaimer,
    '',
    view.viaLabel,
  ]

  return lines.filter(Boolean).join('\n')
}

export function renderAnalystTrustPdfText(view: AnalystTrustView, context: AnalystTrustRenderContext): string {
  const labels = TRUST_LABELS[view.locale]
  const actions = renderAnalystTrustActions(view)
  const lines = [
    view.pdfHeader,
    context.eventName,
    renderAnalystTrustMetaLine(view, context),
    '',
    view.label,
    renderAnalystTrustSummaryText(view),
    `${view.confidenceLabel}: ${view.dataCoverageScore}/100 | ${view.actionabilityLabel}`,
    actions.length > 0 ? `${labels.availableActions}: ${actions.join(' / ')}` : null,
    '',
    view.uiDisclaimer,
    `${view.generatedLabel} ${renderAnalystTrustGeneratedDate(context.generatedDate)}`,
    view.pdfFooter,
  ]

  return lines.filter(Boolean).join('\n')
}

function resolveAnalystDecisionTrustView(
  input: AnalystDecisionSurfaceInput,
  shouldBlockSurface: boolean,
  locale: AnalystTrustLocale
): AnalystTrustView | null {
  if (input.trustView && input.trustView.locale === locale) return input.trustView
  if (!input.qualityGate && !shouldBlockSurface) return input.trustView ?? null

  const qualityGate = input.qualityGate ?? buildFallbackDecisionQualityGate(input)

  return buildAnalystTrustView({
    qualityGate,
    locale,
    eventName:    input.eventName,
    marketType:   input.marketType,
    selection:    input.selection ?? null,
    rawReasoning: input.rawReasoning,
    rawFactors:   input.rawFactors,
  })
}

export function buildAnalystDecisionSurfaceView(input: AnalystDecisionSurfaceInput): AnalystDecisionSurfaceView {
  const showPricing = shouldShowPricingStats({
    qualityGate:        input.qualityGate,
    modelProbability:   input.modelProbability,
    impliedProbability: input.impliedProbability,
    edgePercent:        input.edgePercent,
  })
  const shouldBlockSurface = shouldUseBlockedDecisionSurface(input, showPricing)
  const locale = inferDecisionSurfaceLocale(input, shouldBlockSurface)
  const trustView = resolveAnalystDecisionTrustView(input, shouldBlockSurface, locale)
  const isTrustBlocked = Boolean(
    trustView &&
    shouldBlockSurface
  )
  const legacyRecommendation = input.recommendation
    ? DECISION_RECOMMENDATION_LABELS[input.recommendation] ?? input.recommendation
    : ''

  return {
    isTrustBlocked,
    showPricing,
    locale,
    trustView,
    sportLabel: localizeAnalystTrustSport(input.sport, locale),
    listRecommendationLabel: isTrustBlocked && trustView ? compactTrustLabel(trustView) : legacyRecommendation,
    detailRecommendationLabel: isTrustBlocked && trustView ? trustView.label : legacyRecommendation,
    actionLabel: isTrustBlocked ? localizeDecisionAction(input.finalAction, locale) : localizeDecisionAction(input.finalAction, 'en'),
  }
}

export function renderAnalystDecisionSurfaceShareText(
  surface: AnalystDecisionSurfaceView,
  context: AnalystTrustRenderContext
): string {
  if (surface.isTrustBlocked && surface.trustView) {
    return renderAnalystTrustShareText(surface.trustView, context)
  }

  return [
    `AI Analysis - ${context.eventName}`,
    [
      surface.sportLabel,
      context.marketType,
      context.selection,
      context.offeredOdds != null ? `@${context.offeredOdds}` : null,
      context.bookmaker,
    ].filter(Boolean).join(' · '),
    surface.detailRecommendationLabel,
  ].filter(Boolean).join('\n')
}

export function renderAnalystDecisionSurfacePdfText(
  surface: AnalystDecisionSurfaceView,
  context: AnalystTrustRenderContext
): string {
  if (surface.isTrustBlocked && surface.trustView) {
    return renderAnalystTrustPdfText(surface.trustView, context)
  }

  return [
    'BetTracker AI analysis',
    context.eventName,
    [
      surface.sportLabel,
      context.marketType,
      context.selection,
      context.offeredOdds != null ? `@${context.offeredOdds}` : null,
      context.bookmaker,
    ].filter(Boolean).join(' · '),
    surface.detailRecommendationLabel,
  ].filter(Boolean).join('\n')
}

export function buildAnalystTrustPayload(input: BuildAnalystTrustViewInput): AnalystTrustPayload {
  const trustView = buildAnalystTrustView(input)

  return {
    trust_view: trustView,
    reasoning: trustView.displayReasoning,
    factors: trustView.displayFactors,
  }
}

export function applyQualityGateToPricing(
  result: AnalysisQualityGateResult,
  pricing: PricingFields
): PricingFields {
  if (result.pricingAllowed) return pricing
  return {
    model_probability: null,
    implied_probability: null,
    edge_percent: null,
  }
}

function bucketGatedEdge(edge: number | null): string {
  if (edge == null) return 'unpriced'
  if (edge < -5) return '<-5%'
  if (edge < 0) return '-5% to 0%'
  if (edge < 3) return '0% to 3%'
  if (edge < 7) return '3% to 7%'
  if (edge < 15) return '7% to 15%'
  return '15%+'
}

export function buildAnalystPricingPayload(input: BuildAnalystPricingPayloadInput): AnalystPricingPayload {
  const implied = parseFloat(((1 / input.offeredOdds) * 100).toFixed(2))
  const edge = parseFloat((input.modelProbability - implied).toFixed(2))
  const pricing = applyQualityGateToPricing(input.qualityGate, {
    model_probability: input.modelProbability,
    implied_probability: implied,
    edge_percent: edge,
  })

  const blockedRecommendation: AnalystRecommendation =
    input.qualityGate.status === 'unsupported' ? 'no_value' : 'watch'

  return {
    ...pricing,
    recommendation: input.qualityGate.pricingAllowed ? input.recommendation : blockedRecommendation,
    risk_level: input.qualityGate.pricingAllowed ? input.riskLevel : 'high',
    edge_bucket: bucketGatedEdge(pricing.edge_percent),
    quality_gate: input.qualityGate,
  }
}

export function shouldShowPricingStats(input: PricingRenderInput): boolean {
  return input.qualityGate?.pricingAllowed === true &&
    hasValidProbability(input.modelProbability) &&
    hasValidProbability(input.impliedProbability) &&
    typeof input.edgePercent === 'number' &&
    Number.isFinite(input.edgePercent)
}

export function renderPricingSummaryLine(input: PricingRenderInput): string {
  if (!shouldShowPricingStats(input)) {
    return input.qualityGate
      ? renderQualityGateSummaryText(input.qualityGate)
      : 'Risk warning\nINSUFFICIENT DATA'
  }

  const edge = input.edgePercent ?? 0
  return [
    'Priced betting analysis',
    `Model probability: ${(input.modelProbability ?? 0).toFixed(1)}%`,
    `Implied probability: ${(input.impliedProbability ?? 0).toFixed(1)}%`,
    `Edge: ${edge >= 0 ? '+' : ''}${edge.toFixed(1)}%`,
  ].join(' | ')
}

export function renderQualityGateSummaryText(result: AnalysisQualityGateResult): string {
  if (result.pricingAllowed) {
    return [
      'Priced betting analysis',
      `Data coverage score: ${result.dataCoverageScore}/100`,
    ].join('\n')
  }

  const missing = result.missingDataByLeg.flatMap(leg => [
    `${leg.legLabel} (${leg.sport})`,
    ...leg.missing.map(item => `- ${item}`),
  ])

  return [
    'Risk warning',
    result.label,
    result.supportLabel,
    `Data coverage score: ${result.dataCoverageScore}/100`,
    'Missing data checklist',
    ...missing,
  ].join('\n')
}
