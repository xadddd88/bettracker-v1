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
export type AnalysisActionability = 'actionable' | 'status_unverified' | 'not_actionable'
export type LegSupportLevel = 'full' | 'approximate' | 'unsupported'
export type AnalystTrustLocale = 'en' | 'uk'

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

function inferLegs(input: AnalysisQualityGateInput): Array<AnalysisLegQualityInput & { label: string }> {
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
    const actionability = actionabilityForFixtureStatus(fixtureStatus)
    const missing: string[] = []

    if (actionability === 'not_actionable') {
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
  const status: AnalysisQualityStatus = isMixedSport || hasUnsupportedSport ? 'unsupported' : 'insufficient_data'
  const label = topLevelActionability === 'not_actionable'
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
    noPrice: 'NO PRICE',
    insufficientData: 'INSUFFICIENT DATA',
    unsupportedMixedSportParlay: 'unsupported mixed-sport parlay',
    unsupportedPartial: 'Unsupported / partially supported bet',
    notActionable: 'NOT ACTIONABLE',
    eventStartedOrFinished: 'event already started or finished',
    safeExplanationBlocked: 'Price is unavailable because the coupon does not have enough verified data coverage for every leg.',
    safeExplanationUnsupported: 'Price is unavailable because this parlay contains unsupported or only partially supported legs.',
    safeExplanationUnverified: 'Price is unavailable because event status is unverified and the coupon is missing required per-leg data.',
    safeExplanationNotActionable: 'This coupon is not actionable because at least one event has already started, finished, or is not currently bettable.',
    safeNextSteps: [
      'Verify the start time and fixture status for every leg.',
      'Add current team news, injury context, recent form, and line movement.',
      'Confirm full sport-specific support for every leg before pricing.',
    ],
    leg: 'Leg',
    sport: 'Sport',
    event: 'Event',
    marketSelection: 'Market / selection',
    fixtureStatus: 'Fixture status',
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
    noPrice: 'БЕЗ ОЦІНКИ',
    insufficientData: 'НЕДОСТАТНЬО ДАНИХ',
    unsupportedMixedSportParlay: 'непідтримуваний експрес із різних видів спорту',
    unsupportedPartial: 'Ставка не підтримується або підтримується частково',
    notActionable: 'НЕАКТУАЛЬНО',
    eventStartedOrFinished: 'подія вже почалась або завершилась',
    safeExplanationBlocked: 'Оцінка недоступна, бо для купона бракує перевіреного покриття даних по кожній нозі.',
    safeExplanationUnsupported: 'Оцінка недоступна, бо експрес містить непідтримувані або частково підтримувані ноги.',
    safeExplanationUnverified: 'Оцінка недоступна, бо статус подій не перевірено і бракує обов’язкових даних по ногах.',
    safeExplanationNotActionable: 'Купон неактуальний, бо одна або більше подій уже почалась, завершилась або недоступна для ставки.',
    safeNextSteps: [
      'Перевірити час початку та статус кожної події.',
      'Додати актуальні новини команд, травми, поточну форму та рух лінії.',
      'Підтвердити повну підтримку спортивного модуля для кожної ноги.',
    ],
    leg: 'Нога',
    sport: 'Спорт',
    event: 'Подія',
    marketSelection: 'Ринок / вибір',
    fixtureStatus: 'Статус матчу',
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
    },
  },
} as const

function normalizeTrustLocale(locale: string | null | undefined): AnalystTrustLocale {
  return locale === 'uk' ? 'uk' : 'en'
}

function localizedQualityGateLabel(result: AnalysisQualityGateResult, locale: AnalystTrustLocale): string {
  const labels = TRUST_LABELS[locale]
  if (result.label === 'PRICED BETTING ANALYSIS') return locale === 'uk' ? 'ОЦІНЕНИЙ АНАЛІЗ СТАВКИ' : 'PRICED BETTING ANALYSIS'
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
  return TRUST_LABELS[locale].unsupportedPartial
}

function localizedMissingItem(item: string, locale: AnalystTrustLocale): string {
  const labels = TRUST_LABELS[locale]
  return labels.missing[item as keyof typeof labels.missing] ?? item
}

function inferSafeExplanation(result: AnalysisQualityGateResult, locale: AnalystTrustLocale): string {
  const labels = TRUST_LABELS[locale]
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
  const showWatch = resultActionability !== 'not_actionable'
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
      fixtureStatus,
      fixtureStatusLabel: labels.fixtureStatuses[fixtureStatus],
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
    dataCoverageScore: result.dataCoverageScore,
    actionability: resultActionability,
    actionabilityLabel: labels.actionabilityLabels[resultActionability],
    safeExplanation: inferSafeExplanation(result, locale),
    safeNextSteps: [...labels.safeNextSteps],
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
    lines.push(`${labels.fixtureStatus}: ${leg.fixtureStatusLabel}`)
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
