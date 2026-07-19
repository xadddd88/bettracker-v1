import type { AnalysisDataCoverage, FixtureStatus } from './analysis-quality-gate'

export type AnalystResearchSource = {
  title: string
  url: string
  citedText: string | null
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
  legs: AnalystResearchLeg[]
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
  const implied = Number(((1 / input.offeredOdds) * 100).toFixed(2))
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
- Offered total odds: ${input.offeredOdds} (bookmaker implied probability ${implied}%)
- Bookmaker: ${cleanPromptValue(input.bookmaker) ?? 'not shown'}
- User context: ${cleanPromptValue(input.notes) ?? 'none'}
- Line: ${input.line ?? 'not shown'}

STRUCTURED COUPON LEGS — analyze every leg independently and then their dependence/correlation:
${legText}

RESEARCH INSTRUCTIONS
1. Identify the exact fixture before using current facts. Treat the fixture as unverified if the teams/date/time are ambiguous.
2. Search current sources when the tool is available. Separate sourced current facts from conditional market logic.
3. For a Bet Builder, analyze every leg and explain correlation, shared match-script risk, and why multiplying leg probabilities as independent would be wrong.
4. Do not invent lineups, injuries, form, competition, kickoff status, probabilities, edge, or line movement.
5. Even when pricing is impossible, provide a useful qualitative assessment: what must happen, which leg is more fragile, how the legs interact, and what should be checked before kickoff.
6. Return structured JSON only.`
}

function safeHttpUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
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

export function extractAnalystResearchSources(content: unknown): AnalystResearchSource[] {
  if (!Array.isArray(content)) return []

  const sources = new Map<string, AnalystResearchSource>()
  const add = (urlValue: unknown, titleValue: unknown, citedTextValue?: unknown) => {
    const url = safeHttpUrl(urlValue)
    if (!url) return
    const title = cleanSourceText(titleValue, 240) ?? new URL(url).hostname
    const citedText = cleanSourceText(citedTextValue, 400)
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

    if (record.type === 'web_search_tool_result' && Array.isArray(record.content)) {
      for (const result of record.content) {
        if (!result || typeof result !== 'object') continue
        const item = result as Record<string, unknown>
        if (item.type === 'web_search_result') add(item.url, item.title)
      }
    }
  }

  return [...sources.values()].slice(0, 8)
}

export function usedSuccessfulWebSearch(content: unknown): boolean {
  if (!Array.isArray(content)) return false
  return content.some(block => {
    if (!block || typeof block !== 'object') return false
    const record = block as Record<string, unknown>
    return record.type === 'web_search_tool_result' && Array.isArray(record.content) && record.content.length > 0
  })
}

export function containsAnalystPricingClaim(brief: AnalystResearchBrief): boolean {
  const text = [
    brief.headline,
    brief.summary,
    brief.builderRisk,
    brief.verdict,
    ...brief.dataGaps,
    ...brief.legs.flatMap(leg => [leg.assessment, ...leg.evidence, ...leg.risks]),
  ].filter(Boolean).join('\n')

  const pricingTerm = '(?:model|win|real|fair|implied)?\\s*(?:probability|chance)|edge|expected\\s+value|\\bev\\b|ймовірн(?:ість|ості)|імплікован(?:а|ої)|переваг(?:а|и)|очікуван(?:а|ої)\\s+цінн(?:ість|ості)'
  const number = '[+-]?\\d+(?:[.,]\\d+)?\\s*%'
  return new RegExp(`(?:${pricingTerm})[^.!?\\n]{0,60}${number}|${number}[^.!?\\n]{0,60}(?:${pricingTerm})`, 'i').test(text)
}
