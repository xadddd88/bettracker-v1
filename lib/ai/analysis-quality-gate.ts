export type PricingField = 'model_probability' | 'implied_probability' | 'edge_percent'
export type AnalysisQualityStatus = 'priced' | 'insufficient_data' | 'unsupported'
export type AnalysisType = 'risk_warning' | 'priced_betting_analysis'
export type SportModuleSupport = 'full' | 'approximate' | 'none'

export interface AnalysisDataCoverage {
  liveInjuries?: boolean
  teamNews?: boolean
  recentForm?: boolean
  lineMovement?: boolean
}

export interface AnalysisLegQualityInput {
  label?: string
  sport?: string | null
  eventName?: string | null
  marketType?: string | null
  selection?: string | null
  modelProbability?: number | null
  sportModuleSupport?: SportModuleSupport
  dataCoverage?: AnalysisDataCoverage
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
  legs?: AnalysisLegQualityInput[]
}

export interface MissingDataByLeg {
  legLabel: string
  sport: string
  missing: string[]
}

export interface AnalysisQualityGateResult {
  status: AnalysisQualityStatus
  label:
    | 'PRICED BETTING ANALYSIS'
    | 'INSUFFICIENT DATA'
    | 'NO PRICE - unsupported mixed-sport parlay'
    | 'NO PRICE - unsupported / partially supported bet'
  supportLabel: 'Priced betting analysis' | 'Unsupported / partially supported bet'
  pricingAllowed: boolean
  dataCoverageScore: number
  missingDataByLeg: MissingDataByLeg[]
  suppressedPricingFields: PricingField[]
  reasons: string[]
  analysisType: AnalysisType
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

const SUPPORTED_SPORT_MODULES = new Set(['soccer', 'tennis', 'cs2'])

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

function cleanSport(sport: string | null | undefined): string {
  return (sport ?? 'other').toLowerCase().trim() || 'other'
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

function detectSportFromText(text: string, fallback: string): string {
  const normalized = text.toLowerCase()
  if (TENNIS_TERMS.some(term => normalized.includes(term))) return 'tennis'
  return fallback
}

function inferLegs(input: AnalysisQualityGateInput): Required<Pick<AnalysisLegQualityInput, 'label'>>[] & AnalysisLegQualityInput[] {
  if (input.legs && input.legs.length > 0) {
    return input.legs.map((leg, index) => ({ ...leg, label: leg.label ?? `Leg ${index + 1}` }))
  }

  const primarySport = cleanSport(input.sport)
  if (!isParlayLike(input)) {
    return [{
      label: 'Leg 1',
      sport: primarySport,
      eventName: input.eventName,
      marketType: input.marketType,
      selection: input.selection ?? null,
      modelProbability: input.modelProbability ?? null,
      sportModuleSupport: input.sportModuleSupport,
      dataCoverage: input.dataCoverage,
    }]
  }

  const eventParts = input.eventName.split(/\s+\+\s+/).map(part => part.trim()).filter(Boolean)
  const selectionParts = (input.selection ?? '').split(/\s+\+\s+/).map(part => part.trim())
  const parts = eventParts.length > 1 ? eventParts : [input.eventName]

  return parts.map((eventName, index) => {
    const selection = selectionParts[index] || null
    const sport = detectSportFromText(`${eventName} ${selection ?? ''}`, primarySport)
    return {
      label: `Leg ${index + 1}`,
      sport,
      eventName,
      marketType: input.marketType,
      selection,
      modelProbability: null,
      sportModuleSupport: sport === primarySport ? input.sportModuleSupport : 'approximate',
      dataCoverage: input.dataCoverage,
    }
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

  let checks = 0
  let covered = 0

  for (const leg of legs) {
    const legSport = cleanSport(leg.sport)
    uniqueSports.add(legSport)

    const support = resolveSportSupport(primarySport, legSport, leg.sportModuleSupport)
    const missing: string[] = []

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
        legLabel: leg.label ?? `Leg ${missingDataByLeg.length + 1}`,
        sport: legSport,
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
  const pricingAllowed = missingDataByLeg.length === 0 && reasons.size === 0
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
    }
  }

  const isMixedSport = uniqueSports.size > 1
  const status: AnalysisQualityStatus = isMixedSport || hasUnsupportedSport ? 'unsupported' : 'insufficient_data'
  const label = status === 'unsupported'
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
