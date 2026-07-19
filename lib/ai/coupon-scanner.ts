import { extractJsonObject } from './extract-json'

export type ScannerParseStage =
  | 'vision_response'
  | 'json_extract'
  | 'schema_validation'
  | 'normalization'

type ScannerSport =
  | 'soccer'
  | 'tennis'
  | 'cs2'
  | 'basketball'
  | 'ice_hockey'
  | 'mma'
  | 'other'
  | 'football'
  | 'hockey'

export type LooseScannerLeg = {
  rawText?: string | null
  eventName?: string | null
  event_name?: string | null
  marketType?: string | null
  market_type?: string | null
  selection?: string | null
  odds?: number | string | null
  sport?: ScannerSport | null
  isLive?: boolean | null
  periodOrPhase?: string | null
  period_or_phase?: string | null
  statusText?: string | null
  status_text?: string | null
  scoreText?: string | null
  score_text?: string | null
  statusSource?: 'coupon' | 'unknown' | null
  status_source?: 'coupon' | 'unknown' | null
  statusConfidence?: number | string | null
  status_confidence?: number | string | null
}

export type LooseCouponExtraction = {
  rawText?: string | null
  raw_text?: string | null
  text?: string | null
  couponType?: string | null
  coupon_type?: string | null
  event_name?: string | null
  market_type?: string | null
  selection?: string | null
  odds?: number | string | null
  totalOdds?: number | string | null
  total_odds?: number | string | null
  stake?: number | string | null
  bookmaker?: string | null
  sport?: ScannerSport | null
  eventStartText?: string | null
  event_start_text?: string | null
  legs?: LooseScannerLeg[] | null
  warnings?: string[] | null
}

export type NormalizedScannerLeg = {
  rawText?: string | null
  eventName: string | null
  marketType: string | null
  selection: string | null
  odds: number | null
  sport: Exclude<ScannerSport, 'football' | 'hockey'> | null
  isLive: boolean
  periodOrPhase: string | null
  statusText: string | null
  scoreText: string | null
  statusSource: 'coupon' | 'unknown'
  statusConfidence: number | null
}

export type NormalizedScannerCoupon = {
  event_name: string | null
  market_type: string | null
  selection: string | null
  odds: number | null
  stake: number | null
  bookmaker: string | null
  sport: Exclude<ScannerSport, 'football' | 'hockey'> | null
  event_start_text: string | null
  legs: NormalizedScannerLeg[]
}

export const SCANNER_ACTIONABLE_ERROR =
  'Не вдалося розпізнати купон. Спробуйте чіткіший скрин або введіть дані вручну.'

export function buildScannerFailureResponse(
  scannerParseStage: ScannerParseStage,
  missingFields: string[] = []
) {
  return {
    error: SCANNER_ACTIONABLE_ERROR,
    scannerParseStage,
    missingFields,
  }
}

export function parseScannerVisionResult(rawText: string): LooseCouponExtraction {
  const raw = rawText.trim()
  if (!raw) {
    throw Object.assign(new Error('empty_vision_response'), {
      scannerParseStage: 'vision_response' as ScannerParseStage,
      missingFields: ['visionText'],
    })
  }

  try {
    const parsed = JSON.parse(extractJsonObject(raw)) as LooseCouponExtraction
    return normalizeLooseExtractionFields(parsed)
  } catch {
    if (looksLikeCouponText(raw)) {
      return normalizeLooseExtractionFields({
        rawText: raw,
        couponType: inferCouponType(raw),
        totalOdds: extractTotalOdds(raw),
        warnings: ['vision_output_was_raw_text'],
      })
    }

    throw Object.assign(new Error('scanner_json_extract_failed'), {
      scannerParseStage: 'json_extract' as ScannerParseStage,
      missingFields: ['json'],
    })
  }
}

export function normalizeLooseCouponExtraction(input: LooseCouponExtraction): NormalizedScannerCoupon {
  const rawText = cleanMultilineString(input.rawText ?? input.raw_text ?? input.text)
  const existingLegs = Array.isArray(input.legs)
    ? input.legs.map(normalizeProvidedLeg).filter(hasLegIdentity)
    : []
  const parsedRawLegs = rawText ? parseLegsFromRawText(rawText) : []
  const flattenedLegs = parsedRawLegs.length > 0 ? [] : parseLegsFromFlattenedFields(input)
  const legs = existingLegs.length > 0 ? existingLegs : parsedRawLegs.length > 0 ? parsedRawLegs : flattenedLegs

  if (legs.length === 0) {
    throw Object.assign(new Error('scanner_normalization_failed'), {
      scannerParseStage: 'normalization' as ScannerParseStage,
      missingFields: ['legs'],
    })
  }

  const totalOdds = toNumber(input.totalOdds ?? input.total_odds ?? input.odds)
    ?? extractTotalOdds(rawText ?? '')
    ?? null
  const isExpress = legs.length > 1 || /express|parlay|експрес|экспресс/i.test(String(input.couponType ?? input.coupon_type ?? input.market_type ?? ''))
  const joinedEvents = legs.map(leg => leg.eventName).filter(Boolean).join(' + ') || null
  const joinedSelections = legs.map(leg => leg.selection).filter(Boolean).join(' + ') || null
  const sport = canonicalSport(input.sport) ?? legs[0]?.sport ?? null

  return {
    event_name: cleanString(input.event_name) ?? joinedEvents,
    market_type: cleanString(input.market_type) ?? (isExpress ? `Експрес (${legs.length} ноги)` : legs[0]?.marketType ?? null),
    selection: cleanString(input.selection) ?? joinedSelections,
    odds: totalOdds,
    stake: toNumber(input.stake),
    bookmaker: cleanString(input.bookmaker),
    sport,
    event_start_text: cleanString(input.eventStartText ?? input.event_start_text)
      ?? extractEventStartText(rawText ?? ''),
    legs,
  }
}

function normalizeLooseExtractionFields(input: LooseCouponExtraction): LooseCouponExtraction {
  return {
    ...input,
    rawText: cleanMultilineString(input.rawText ?? input.raw_text ?? input.text),
    couponType: cleanString(input.couponType ?? input.coupon_type),
    totalOdds: toNumber(input.totalOdds ?? input.total_odds ?? input.odds),
    warnings: Array.isArray(input.warnings) ? input.warnings.filter(Boolean).map(String) : [],
  }
}

function normalizeProvidedLeg(leg: LooseScannerLeg): NormalizedScannerLeg {
  const rawText = cleanString(leg.rawText)
  const eventName = stripPhasePrefix(cleanString(leg.eventName ?? leg.event_name) ?? rawText)
  const periodOrPhase = cleanString(leg.periodOrPhase ?? leg.period_or_phase)
    ?? extractPhase(cleanString(leg.eventName ?? leg.event_name) ?? rawText ?? '')
  const isLive = Boolean(leg.isLive) || isLivePhase(periodOrPhase) || /лайв|live|in-play/i.test(rawText ?? '')
  return {
    rawText,
    eventName,
    marketType: cleanString(leg.marketType ?? leg.market_type),
    selection: cleanString(leg.selection),
    odds: toNumber(leg.odds),
    sport: canonicalSport(leg.sport) ?? inferSport(periodOrPhase, eventName),
    isLive,
    periodOrPhase,
    statusText: cleanString(leg.statusText ?? leg.status_text),
    scoreText: cleanString(leg.scoreText ?? leg.score_text),
    statusSource: isLive ? 'coupon' : leg.statusSource ?? leg.status_source ?? 'unknown',
    statusConfidence: toNumber(leg.statusConfidence ?? leg.status_confidence),
  }
}

function parseLegsFromRawText(rawText: string): NormalizedScannerLeg[] {
  const lines = rawText
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
  const legs: NormalizedScannerLeg[] = []

  for (let i = 0; i < lines.length; i += 1) {
    const markerLine = lines[i]
    const liveInMarker = /^(лайв|live|in-play)$/i.test(markerLine)
    const inlineLive = /^(лайв|live|in-play)\b[:\s-]*/i.test(markerLine)
    if (!liveInMarker && !inlineLive && !extractPhase(markerLine)) continue

    const eventLine = inlineLive
      ? markerLine.replace(/^(лайв|live|in-play)\b[:\s-]*/i, '').trim()
      : lines[i + 1]
    if (!eventLine || !looksLikeEventLine(eventLine)) continue

    const marketLine = inlineLive ? lines[i + 1] : lines[i + 2]
    const selectionLine = inlineLive ? lines[i + 2] : lines[i + 3]
    const oddsLine = inlineLive ? lines[i + 3] : lines[i + 4]
    const phase = extractPhase(eventLine)
    const eventName = stripPhasePrefix(eventLine)
    const odds = toNumber(oddsLine)

    legs.push({
      rawText: [markerLine, eventLine, marketLine, selectionLine, oddsLine].filter(Boolean).join('\n'),
      eventName,
      marketType: cleanString(marketLine),
      selection: cleanString(selectionLine),
      odds,
      sport: inferSport(phase, eventName),
      isLive: true,
      periodOrPhase: phase,
      statusText: 'Лайв',
      scoreText: null,
      statusSource: 'coupon',
      statusConfidence: 0.95,
    })
  }

  return legs
}

function parseLegsFromFlattenedFields(input: LooseCouponExtraction): NormalizedScannerLeg[] {
  const eventParts = splitExpressParts(cleanString(input.event_name))
  const selectionParts = splitExpressParts(cleanString(input.selection))
  if (eventParts.length < 2) return []

  const topLevelSport = canonicalSport(input.sport)
  const topLevelMarket = cleanString(input.market_type)

  return eventParts.map((eventPart, index) => {
    const phase = extractPhase(eventPart)
    const eventName = stripPhasePrefix(eventPart)
    const sport = inferSport(phase, eventName) ?? topLevelSport
    const isLive = isLivePhase(phase)
    const selection = selectionParts[index] ?? null
    const marketType = inferLegMarketType(sport, topLevelMarket)
    const statusSource: NormalizedScannerLeg['statusSource'] = isLive ? 'coupon' : 'unknown'

    return {
      rawText: [eventPart, marketType, selection].filter(Boolean).join('\n'),
      eventName,
      marketType,
      selection,
      odds: null,
      sport,
      isLive,
      periodOrPhase: phase,
      statusText: isLive ? 'Лайв' : null,
      scoreText: null,
      statusSource,
      statusConfidence: isLive ? 0.95 : null,
    }
  }).filter(hasLegIdentity)
}

function hasLegIdentity(leg: NormalizedScannerLeg): boolean {
  return Boolean(leg.eventName || leg.selection || leg.rawText)
}

function looksLikeCouponText(text: string): boolean {
  return /(лайв|live|переможець|результат матчу|загальний коефіцієнт|кількість результатів|odds|коеф)/i.test(text)
}

function inferCouponType(text: string): string {
  return /кількість результатів\s*\n?\s*[2-9]|express|parlay|експрес|экспресс/i.test(text) ? 'express' : 'single'
}

function splitExpressParts(value: string | null): string[] {
  if (!value) return []
  return value
    .split(/\s+\+\s+/)
    .map(part => part.trim())
    .filter(Boolean)
}

function inferLegMarketType(
  sport: NormalizedScannerLeg['sport'],
  topLevelMarket: string | null
): string | null {
  if (topLevelMarket && !/express|parlay|експрес|экспресс/i.test(topLevelMarket)) return topLevelMarket
  if (sport === 'tennis') return 'Переможець'
  if (sport === 'soccer') return 'Результат матчу'
  return null
}

function looksLikeEventLine(line: string): boolean {
  return line.includes(' - ') || line.includes(' vs ') || line.includes(' v ')
}

function stripPhasePrefix(value: string | null | undefined): string | null {
  const text = cleanString(value)
  if (!text) return null
  return text
    .replace(/^(?:\d+\s*[-–]?\s*й\s+сет|перерва|halftime|half-time)\s*,\s*/i, '')
    .trim()
}

function extractPhase(value: string): string | null {
  const text = cleanString(value)
  if (!text) return null
  const tennisSet = text.match(/(\d+\s*[-–]?\s*й\s+сет)/i)
  if (tennisSet) return tennisSet[1].replace(/\s+/g, ' ').replace(/[–]/g, '-')
  const halftime = text.match(/(перерва|halftime|half-time)/i)
  if (halftime) return /^перерва$/i.test(halftime[1]) ? 'Перерва' : halftime[1]
  return null
}

function isLivePhase(value: string | null | undefined): boolean {
  return Boolean(value && /сет|перерва|halftime|half-time/i.test(value))
}

function inferSport(phase: string | null, eventName: string | null): NormalizedScannerLeg['sport'] {
  if (phase && /сет/i.test(phase)) return 'tennis'
  if (phase && /перерва|halftime|half-time/i.test(phase)) return 'soccer'
  if (eventName && /тіафо|бублик|фріц|сонего|svajda|de minaur/i.test(eventName)) return 'tennis'
  return null
}

function canonicalSport(sport: ScannerSport | null | undefined): NormalizedScannerLeg['sport'] {
  if (!sport) return null
  if (sport === 'football') return 'soccer'
  if (sport === 'hockey') return 'ice_hockey'
  return sport
}

function extractTotalOdds(rawText: string): number | null {
  const lines = rawText.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
  for (let i = 0; i < lines.length; i += 1) {
    if (/загальний коефіцієнт|total odds|overall odds/i.test(lines[i])) {
      return toNumber(lines[i + 1])
    }
  }
  const values = lines.map(toNumber).filter((value): value is number => value != null)
  return values.length ? values[values.length - 1] : null
}

function extractEventStartText(rawText: string): string | null {
  const lines = rawText.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
  return lines.find(line =>
    /(?:сьогодні|сегодня|today|завтра|tomorrow)|(?:\b\d{1,2}[./-]\d{1,2}(?:[./-]\d{2,4})?\b)/i.test(line) &&
    /\b\d{1,2}:\d{2}\b/.test(line)
  ) ?? null
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string') return null
  const normalized = value.trim().replace(',', '.')
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) return null
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

function cleanString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const cleaned = value.replace(/\s+/g, ' ').trim()
  return cleaned.length ? cleaned : null
}

function cleanMultilineString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const cleaned = value
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .split('\n')
    .map(line => line.trim())
    .join('\n')
    .trim()
  return cleaned.length ? cleaned : null
}
