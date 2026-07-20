import type { AnalysisDataCoverage, FixtureStatus } from './analysis-quality-gate'

export type AnalystResearchSource = {
  title: string
  url: string
  citedText: string | null
}

export type AnalystSourcedClaim = {
  text: string
  sourceUrl: string
}

export type AnalystResearchLeg = {
  legNumber: number
  eventName: string
  marketType: string
  selection: string | null
  assessment: string
  evidence: string[]
  risks: string[]
  fixtureStatus: FixtureStatus
  dataCoverage: AnalysisDataCoverage
}

export type AnalystResearchBrief = {
  headline: string
  summary: string
  builderRisk: string | null
  verdict: string
  dataGaps: string[]
  sourcedClaims: AnalystSourcedClaim[]
  legs: AnalystResearchLeg[]
}

export type AnalystCouponLegIdentity = {
  eventName: string
  marketType: string
  selection: string | null
  isLive?: boolean
}

export type AnalystPromptLeg = {
  eventName?: string | null
  marketType?: string | null
  selection?: string | null
  odds?: number | null
  sport?: string | null
  isLive?: boolean
  periodOrPhase?: string | null
  statusText?: string | null
  scoreText?: string | null
}

export type AnalystWebSearchFailureReason =
  | 'global_disabled'
  | 'profile_disabled'
  | 'profile_unavailable'
  | 'configuration_rejected'
  | 'provider_no_cited_results'
  | 'research_contract_rejected'
  | 'claim_source_binding_failed'

export type AnalystWebSearchTelemetry = {
  enabled: boolean
  attempted: boolean
  used: boolean
  failureReason: AnalystWebSearchFailureReason | null
}

export type BuildAnalystResearchMessageInput = {
  sport: string
  eventName: string
  marketType: string
  selection?: string | null
  line?: number | null
  offeredOdds: number
  bookmaker?: string | null
  notes?: string | null
  couponEventTime?: string | null
  clientTimezone?: string | null
  currentUtcIso: string
  legs?: AnalystPromptLeg[] | null
}

function cleanPromptValue(value: string | null | undefined): string | null {
  if (!value) return null
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim()
  return cleaned || null
}

function normalizedIdentity(value: string | null | undefined): string {
  return (value ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim().toLocaleLowerCase('en-US')
}

function sameIdentity(left: string | null | undefined, right: string | null | undefined): boolean {
  return normalizedIdentity(left) === normalizedIdentity(right)
}

const EMPTY_COVERAGE: AnalysisDataCoverage = {
  liveInjuries: false,
  teamNews: false,
  recentForm: false,
  lineMovement: false,
}

export function bindAnalystSourcedClaims(
  claims: AnalystSourcedClaim[],
  citedSources: AnalystResearchSource[],
): AnalystSourcedClaim[] {
  const citedByUrl = new Map(citedSources.map(source => [source.url, source]))
  const sourcedClaims: AnalystSourcedClaim[] = []
  const seenClaims = new Set<string>()
  for (const claim of claims) {
    const source = citedByUrl.get(claim.sourceUrl)
    if (!source?.citedText) continue
    const claimText = claim.text.replace(/\s+/g, ' ').trim()
    const citedText = source.citedText.replace(/\s+/g, ' ').trim()
    if (!claimText || claimText !== citedText) continue
    const key = `${source.url}\n${claimText}`
    if (seenClaims.has(key)) continue
    seenClaims.add(key)
    sourcedClaims.push({ text: claimText, sourceUrl: source.url })
    if (sourcedClaims.length === 12) break
  }
  return sourcedClaims
}

/**
 * Bind provider commentary to coupon legs by the explicit 1-based leg number.
 * Identity must still match the corresponding coupon leg, so a reordered or
 * relabelled provider response fails closed instead of silently swapping prose.
 * Provider-declared coverage is deliberately discarded until claims can be
 * mapped to individual citations.
 */
export function alignAnalystResearchBriefToCoupon(
  brief: AnalystResearchBrief,
  couponLegs: AnalystCouponLegIdentity[],
  citedSources: AnalystResearchSource[] = [],
): AnalystResearchBrief | null {
  if (brief.legs.length !== couponLegs.length || couponLegs.length === 0) return null

  const byNumber = new Map<number, AnalystResearchLeg>()
  for (const leg of brief.legs) {
    if (!Number.isInteger(leg.legNumber) || leg.legNumber < 1 || leg.legNumber > couponLegs.length) return null
    if (byNumber.has(leg.legNumber)) return null
    byNumber.set(leg.legNumber, leg)
  }

  const aligned: AnalystResearchLeg[] = []
  for (let index = 0; index < couponLegs.length; index += 1) {
    const couponLeg = couponLegs[index]
    const researchLeg = byNumber.get(index + 1)
    if (!researchLeg) return null
    if (
      !sameIdentity(researchLeg.eventName, couponLeg.eventName) ||
      !sameIdentity(researchLeg.marketType, couponLeg.marketType) ||
      !sameIdentity(researchLeg.selection, couponLeg.selection)
    ) return null

    aligned.push({
      ...researchLeg,
      legNumber: index + 1,
      eventName: couponLeg.eventName,
      marketType: couponLeg.marketType,
      selection: couponLeg.selection,
      fixtureStatus: couponLeg.isLive ? 'live' : 'unknown',
      dataCoverage: { ...EMPTY_COVERAGE },
    })
  }

  return {
    ...brief,
    sourcedClaims: bindAnalystSourcedClaims(brief.sourcedClaims, citedSources),
    legs: aligned,
  }
}

export function formatCouponLegsForResearch(legs: AnalystPromptLeg[] | null | undefined): string {
  if (!legs?.length) return 'No structured coupon legs were supplied.'

  return legs.map((leg, index) => {
    const details = [
      `event=${cleanPromptValue(leg.eventName) ?? 'unknown'}`,
      `market=${cleanPromptValue(leg.marketType) ?? 'unknown'}`,
      `selection=${cleanPromptValue(leg.selection) ?? 'unknown'}`,
      `odds=${typeof leg.odds === 'number' && Number.isFinite(leg.odds) ? leg.odds : 'not shown'}`,
      `sport=${cleanPromptValue(leg.sport) ?? 'unknown'}`,
      `live=${leg.isLive ? 'yes' : 'no'}`,
      `phase=${cleanPromptValue(leg.periodOrPhase) ?? 'not shown'}`,
      `status=${cleanPromptValue(leg.statusText) ?? 'not shown'}`,
    ]
    return `Leg ${index + 1}: ${details.join(' | ')}`
  }).join('\n')
}

export function buildAnalystResearchMessage(input: BuildAnalystResearchMessageInput): string {
  const legText = formatCouponLegsForResearch(input.legs)

  return `Research and analyze this betting opportunity.

CURRENT-TIME CONTEXT
- Current UTC time: ${input.currentUtcIso}
- User timezone: ${cleanPromptValue(input.clientTimezone) ?? 'unknown'}
- Exact date/time text visible on coupon: ${cleanPromptValue(input.couponEventTime) ?? 'not shown'}

COUPON SUMMARY
- Sport: ${input.sport}
- Event: ${input.eventName}
- Market: ${input.marketType}
- Selection: ${cleanPromptValue(input.selection) ?? 'not shown'}
- Offered total odds: ${input.offeredOdds} (context only; this is not evidence of fair price, probability, edge, or EV)
- Bookmaker: ${cleanPromptValue(input.bookmaker) ?? 'not shown'}
- User context: ${cleanPromptValue(input.notes) ?? 'none'}
- Line: ${input.line ?? 'not shown'}

STRUCTURED COUPON LEGS — analyze every leg independently and then their dependence/correlation:
${legText}

RESEARCH INSTRUCTIONS
1. Identify the exact fixture before using current facts. Treat the fixture as unverified if the teams/date/time are ambiguous.
2. When the web-search tool is available, a successful report requires current searches and exact cited excerpts. If search or citation binding fails, do not compensate with unsupported current facts.
3. For a Bet Builder, analyze every leg and explain correlation, shared match-script risk, and why multiplying leg probabilities as independent would be wrong.
4. Do not invent lineups, injuries, form, competition, kickoff status, probabilities, edge, or line movement.
5. Even when pricing is impossible, provide a useful qualitative assessment: what must happen, which leg is more fragile, how the legs interact, and what should be checked before kickoff.
6. Return structured JSON only.`
}

export type AnalystLiveEnvelope = {
  couponIsLive?: boolean | null
  couponStatusText?: string | null
  legs?: Pick<AnalystPromptLeg, 'isLive' | 'periodOrPhase' | 'statusText' | 'scoreText'>[] | null
}

const LIVE_STATUS_PATTERN =
  /(?:^|[^\p{L}\p{N}])(?:live|in[- ]?play|en vivo|лайв|half[- ]?time|halftime|перерва|перерыв)(?=$|[^\p{L}\p{N}])/iu

const LIVE_PHASE_PATTERN =
  /(?:^|[^\p{L}\p{N}])(?:q[1-4]|[1-5](?:st|nd|rd|th)?[- ]?(?:half|quarter|period|set)|[1-5](?:-?(?:й|я|е))?[- ]?(?:тайм|чверть|період|период|сет)|1h|2h|ot|extra[- ]?time)(?=$|[^\p{L}\p{N}])/iu

function containsPositiveLiveText(value: string | null | undefined, includePhase = false): boolean {
  const cleaned = cleanPromptValue(value)
  if (!cleaned) return false
  return LIVE_STATUS_PATTERN.test(cleaned) || (includePhase && LIVE_PHASE_PATTERN.test(cleaned))
}

function containsScoreEvidence(value: string | null | undefined): boolean {
  const cleaned = cleanPromptValue(value)
  return cleaned !== null && !/^(?:[-—]|n\/?a|not shown|unknown)$/iu.test(cleaned)
}

export function hasUnsupportedLiveAnalystInput(input: AnalystLiveEnvelope): boolean {
  if (input.couponIsLive === true) return true

  if (containsPositiveLiveText(input.couponStatusText, true)) return true

  return input.legs?.some(leg => {
    if (leg.isLive === true) return true
    if (containsPositiveLiveText(leg.statusText, true)) return true
    if (containsPositiveLiveText(leg.periodOrPhase, true)) return true
    return containsScoreEvidence(leg.scoreText)
  }) ?? false
}

export type AnalystScannerSnapshot<TLeg extends AnalystPromptLeg> = {
  form: {
    eventName: string
    marketType: string
    selection: string
    odds: string
    bookmaker: string
    eventTime: string
  }
  legs: TLeg[] | null
  liveEnvelope: {
    isLive: boolean
    statusText: string | null
    periodOrPhase: string | null
    scoreText: string | null
  }
}

export function clearAnalystScannerLegsAfterManualEdit<TLeg, TEnvelope>(current: {
  legs: TLeg[] | null
  liveEnvelope: TEnvelope
} | null): { legs: null; liveEnvelope: TEnvelope } | null {
  if (!current) return null
  return { legs: null, liveEnvelope: current.liveEnvelope }
}

/**
 * Build one replacement snapshot from one successful scanner response.
 * Missing scanner fields become empty fields instead of inheriting stale data
 * from an older coupon. The form, legs and live envelope therefore retain one
 * provenance boundary even when the scanner response is sparse.
 */
export function buildAnalystScannerSnapshot<TLeg extends AnalystPromptLeg>(input: {
  event_name?: string | null
  market_type?: string | null
  selection?: string | null
  odds?: number | null
  bookmaker?: string | null
  event_start_text?: string | null
  legs?: TLeg[] | null
}): AnalystScannerSnapshot<TLeg> {
  const legs = Array.isArray(input.legs) && input.legs.length > 0 ? input.legs : null
  const isLive = hasUnsupportedLiveAnalystInput({ legs })
  const evidenceLeg = legs?.find(leg => hasUnsupportedLiveAnalystInput({ legs: [leg] }))
    ?? legs?.find(leg => Boolean(leg.statusText || leg.periodOrPhase || leg.scoreText))
    ?? null

  return {
    form: {
      eventName: cleanPromptValue(input.event_name) ?? '',
      marketType: cleanPromptValue(input.market_type) ?? '',
      selection: cleanPromptValue(input.selection) ?? '',
      odds: typeof input.odds === 'number' && Number.isFinite(input.odds) ? String(input.odds) : '',
      bookmaker: cleanPromptValue(input.bookmaker) ?? '',
      eventTime: cleanPromptValue(input.event_start_text) ?? '',
    },
    legs,
    liveEnvelope: {
      isLive,
      statusText: cleanPromptValue(evidenceLeg?.statusText) ?? null,
      periodOrPhase: cleanPromptValue(evidenceLeg?.periodOrPhase) ?? null,
      scoreText: cleanPromptValue(evidenceLeg?.scoreText) ?? null,
    },
  }
}

/** A synchronous latest-request-wins gate shared by scanner UI and tests. */
export function createAnalystScanGenerationGate() {
  let generation = 0
  let active = false

  return {
    begin(): number {
      generation += 1
      active = true
      return generation
    },
    isCurrent(requestGeneration: number): boolean {
      return active && requestGeneration === generation
    },
    finish(requestGeneration: number): boolean {
      if (!active || requestGeneration !== generation) return false
      active = false
      return true
    },
    isActive(): boolean {
      return active
    },
  }
}

export function resolveAnalystWebSearchTelemetry(input: {
  globalEnabled: boolean
  profileEnabled: boolean
  profileReadFailed: boolean
  attempted: boolean
  configurationRejected: boolean
  researchContractAccepted: boolean
  citedSourceCount: number
  boundClaimCount: number
}): AnalystWebSearchTelemetry {
  const enabled = input.globalEnabled && !input.profileReadFailed && input.profileEnabled
  const attempted = enabled && input.attempted

  if (!input.globalEnabled) return { enabled: false, attempted: false, used: false, failureReason: 'global_disabled' }
  if (input.profileReadFailed) return { enabled: false, attempted: false, used: false, failureReason: 'profile_unavailable' }
  if (!input.profileEnabled) return { enabled: false, attempted: false, used: false, failureReason: 'profile_disabled' }
  if (input.configurationRejected) return { enabled, attempted, used: false, failureReason: 'configuration_rejected' }
  if (!input.researchContractAccepted) return { enabled, attempted, used: false, failureReason: 'research_contract_rejected' }
  if (input.citedSourceCount < 1) return { enabled, attempted, used: false, failureReason: 'provider_no_cited_results' }
  if (input.boundClaimCount < 1) return { enabled, attempted, used: false, failureReason: 'claim_source_binding_failed' }
  return { enabled, attempted, used: true, failureReason: null }
}

function safeHttpUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.username || url.password) return null

    const hostname = url.hostname.toLowerCase().replace(/\.$/, '')
    if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.includes(':')) return null

    const octets = hostname.split('.').map(part => /^\d{1,3}$/.test(part) ? Number(part) : Number.NaN)
    if (octets.length === 4 && octets.every(part => Number.isInteger(part) && part >= 0 && part <= 255)) {
      const [a, b] = octets
      const nonPublic =
        a === 0 || a === 10 || a === 127 || a >= 224 ||
        (a === 100 && b >= 64 && b <= 127) ||
        (a === 169 && b === 254) ||
        (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && b === 0 && (octets[2] === 0 || octets[2] === 2)) ||
        (a === 192 && b === 88 && octets[2] === 99) ||
        (a === 192 && b === 168) ||
        (a === 198 && (b === 18 || b === 19)) ||
        (a === 198 && b === 51 && octets[2] === 100) ||
        (a === 203 && b === 0 && octets[2] === 113)
      if (nonPublic) return null
    } else if (!hostname.includes('.')) {
      return null
    }

    return url.toString().slice(0, 2_000)
  } catch {
    return null
  }
}

function cleanSourceText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null
  const cleaned = value.replace(/\s+/g, ' ').trim()
  return cleaned ? cleaned.slice(0, max) : null
}

function boundedCitationText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null
  const cleaned = value.replace(/\s+/g, ' ').trim()
  return cleaned && cleaned.length <= max ? cleaned : null
}

export function extractAnalystResearchSources(content: unknown): AnalystResearchSource[] {
  if (!Array.isArray(content)) return []

  const sources = new Map<string, AnalystResearchSource>()
  const add = (urlValue: unknown, titleValue: unknown, citedTextValue?: unknown) => {
    const url = safeHttpUrl(urlValue)
    if (!url) return
    const title = cleanSourceText(titleValue, 240) ?? new URL(url).hostname
    // Never truncate a citation before exact claim binding: a suffix can carry
    // a material qualifier. Oversized excerpts fail closed instead.
    const citedText = boundedCitationText(citedTextValue, 400)
    const existing = sources.get(url)
    sources.set(url, {
      title: existing?.title ?? title,
      url,
      citedText: existing?.citedText ?? citedText,
    })
  }

  for (const block of content) {
    if (!block || typeof block !== 'object') continue
    const record = block as Record<string, unknown>

    if (record.type === 'text' && Array.isArray(record.citations)) {
      for (const citation of record.citations) {
        if (!citation || typeof citation !== 'object') continue
        const item = citation as Record<string, unknown>
        if (item.type === 'web_search_result_location') {
          add(item.url, item.title, item.cited_text)
        }
      }
    }

  }

  return [...sources.values()].slice(0, 8)
}

export function usedSuccessfulWebSearch(content: unknown): boolean {
  return extractAnalystResearchSources(content).length > 0
}

export function containsAnalystPricingClaim(brief: AnalystResearchBrief): boolean {
  const text = [
    brief.headline,
    brief.summary,
    brief.builderRisk,
    brief.verdict,
    ...brief.dataGaps,
    ...brief.sourcedClaims.map(claim => claim.text),
    ...brief.legs.flatMap(leg => [leg.assessment, ...leg.evidence, ...leg.risks]),
  ].filter(Boolean).join('\n')

  const pricingTerm = [
    'probabilit(?:y|ies)', 'chance', 'edge', 'expected\\s+value', '\\bev\\b', 'fair\\s+(?:odds?|price)', 'implied',
    'ймовірн(?:ість|ості)', 'шанс', 'переваг(?:а|и)', 'очікуван(?:а|ої)\\s+цінн(?:ість|ості)', 'справедлив(?:ий|ого)\\s+коефіцієнт', 'справедлив(?:а|ої)\\s+цін(?:а|и)',
    'вероятност(?:ь|и)', 'преимуществ(?:о|а)', 'ожидаем(?:ая|ой)\\s+ценност(?:ь|и)', 'справедлив(?:ый|ого)\\s+коэффициент', 'справедлив(?:ая|ой)\\s+цен(?:а|ы|е)',
    'probabilidad', 'posibilidad', 'ventaja', 'valor\\s+esperado', 'cuota\\s+justa',
    'probabilit[ée]', 'avantage', 'valeur\\s+attendue', 'cote\\s+juste',
    'wahrscheinlichkeit', 'vorteil', 'erwartungswert', 'faire\\s+quote',
    'احتمال', 'احتمالية', 'فرصة', 'أفضلية', 'قيمة\\s+متوقعة',
  ].join('|')
  const number = '[+-]?[\\p{N}]+(?:[.,][\\p{N}]+)?(?:\\s*(?:%|percent|percentage|units?|u|bps?))?'
  return new RegExp(
    `(?:${pricingTerm})[^.!?\\n]{0,60}${number}|${number}[^.!?\\n]{0,60}(?:${pricingTerm})`,
    'iu',
  ).test(text)
}

const FIXTURE_STATUSES = new Set<FixtureStatus>([
  'scheduled', 'unknown', 'live', 'finished', 'cancelled', 'abandoned',
  'postponed', 'retired', 'walkover', 'not_bettable',
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function boundedString(value: unknown, min: number, max: number): string | null {
  if (typeof value !== 'string') return null
  const cleaned = value.trim()
  return cleaned.length >= min && cleaned.length <= max ? cleaned : null
}

function boundedStrings(value: unknown, maxItems: number, maxLength: number): string[] | null {
  if (!Array.isArray(value) || value.length > maxItems) return null
  const strings = value.map(item => boundedString(item, 2, maxLength))
  return strings.every((item): item is string => item !== null) ? strings : null
}

export function parseStoredAnalystResearchBrief(value: unknown): AnalystResearchBrief | null {
  if (!isRecord(value)) return null
  const headline = boundedString(value.headline, 5, 180)
  const summary = boundedString(value.summary, 20, 2_500)
  const verdict = boundedString(value.verdict, 10, 1_500)
  const builderRisk = value.builderRisk === null ? null : boundedString(value.builderRisk, 1, 1_500)
  const dataGaps = boundedStrings(value.dataGaps, 12, 300)
  const rawSourcedClaims = value.sourcedClaims ?? []
  if (
    !headline || !summary || !verdict ||
    (builderRisk === null && value.builderRisk !== null) ||
    !dataGaps
  ) return null
  if (!Array.isArray(rawSourcedClaims) || rawSourcedClaims.length > 12) return null
  const sourcedClaims: AnalystSourcedClaim[] = []
  for (const item of rawSourcedClaims) {
    if (!isRecord(item)) return null
    const text = boundedString(item.text, 2, 400)
    const sourceUrl = safeHttpUrl(item.sourceUrl)
    if (!text || !sourceUrl) return null
    sourcedClaims.push({ text, sourceUrl })
  }
  if (!Array.isArray(value.legs) || value.legs.length < 1 || value.legs.length > 20) return null

  const legs: AnalystResearchLeg[] = []
  for (const item of value.legs) {
    if (!isRecord(item) || !isRecord(item.dataCoverage)) return null
    const legNumber = item.legNumber
    const eventName = boundedString(item.eventName, 1, 500)
    const marketType = boundedString(item.marketType, 1, 500)
    const selection = item.selection === null ? null : boundedString(item.selection, 1, 200)
    const assessment = boundedString(item.assessment, 10, 1_500)
    const evidence = boundedStrings(item.evidence, 8, 500)
    const risks = boundedStrings(item.risks, 8, 500)
    const fixtureStatus = item.fixtureStatus
    const coverage = item.dataCoverage
    if (
      !Number.isInteger(legNumber) || (legNumber as number) < 1 || (legNumber as number) > 20 ||
      !eventName || !marketType || (selection === null && item.selection !== null) ||
      !assessment || !evidence || !risks || typeof fixtureStatus !== 'string' ||
      !FIXTURE_STATUSES.has(fixtureStatus as FixtureStatus) ||
      typeof coverage.liveInjuries !== 'boolean' || typeof coverage.teamNews !== 'boolean' ||
      typeof coverage.recentForm !== 'boolean' || typeof coverage.lineMovement !== 'boolean'
    ) return null

    legs.push({
      legNumber: legNumber as number,
      eventName,
      marketType,
      selection,
      assessment,
      evidence,
      risks,
      fixtureStatus: fixtureStatus as FixtureStatus,
      dataCoverage: {
        liveInjuries: coverage.liveInjuries,
        teamNews: coverage.teamNews,
        recentForm: coverage.recentForm,
        lineMovement: coverage.lineMovement,
      },
    })
  }

  return { headline, summary, builderRisk, verdict, dataGaps, sourcedClaims, legs }
}

export function parseStoredAnalystResearchSources(value: unknown): AnalystResearchSource[] {
  if (!Array.isArray(value)) return []
  const sources: AnalystResearchSource[] = []
  const seen = new Set<string>()
  for (const item of value) {
    if (!isRecord(item)) continue
    const url = safeHttpUrl(item.url)
    const title = boundedString(item.title, 1, 240)
    const citedText = item.citedText === null ? null : boundedString(item.citedText, 1, 400)
    if (!url || !title || (citedText === null && item.citedText !== null) || seen.has(url)) continue
    seen.add(url)
    sources.push({ title, url, citedText })
    if (sources.length === 8) break
  }
  return sources
}

export type PausableAnthropicResponse<TContent> = {
  content: TContent
  stop_reason: string | null
}

export async function completePausedAnthropicTurn<TContent, TResponse extends PausableAnthropicResponse<TContent>>(
  initial: TResponse,
  continueTurn: (pausedContent: TContent, continuation: number) => Promise<TResponse>,
  maxContinuations = 2,
): Promise<TResponse> {
  let response = initial
  let continuation = 0
  while (response.stop_reason === 'pause_turn') {
    if (continuation >= maxContinuations) throw new Error('Anthropic server-tool turn exceeded continuation limit')
    continuation += 1
    response = await continueTurn(response.content, continuation)
  }
  return response
}
