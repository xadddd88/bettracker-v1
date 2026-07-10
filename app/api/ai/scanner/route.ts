import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { trackServerEvent } from '@/lib/analytics/server'
import { EVENTS } from '@/lib/analytics/events'
import {
  buildScannerFailureResponse,
  normalizeLooseCouponExtraction,
  parseScannerVisionResult,
  type ScannerParseStage,
} from '@/lib/ai/coupon-scanner'
import { enforceRateLimit, RATE_LIMITS } from '@/lib/rate-limit'

// ─── Constants ───────────────────────────────────────────────
const ALLOWED_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const
const MAX_BASE64_CHARS = 10 * 1024 * 1024 // ~7.5 MB original image

const SCAN_PROMPT = `You are a betting slip OCR expert. Analyze this screenshot of a betting coupon or slip.

Read ALL text EXACTLY character-by-character as shown in the image. Do NOT guess or correct team names.

The coupon may be a SINGLE bet or an EXPRESS/PARLAY (multiple legs combined).

Return ONLY a valid JSON object — no explanation, no markdown, no code fences.

Prefer this loose extraction contract. The server will normalize it deterministically:
{
  "rawText": "all visible coupon text preserving line order",
  "couponType": "single|express|parlay|unknown",
  "totalOdds": 7.253,
  "warnings": [],
  "legs": [
    {
      "rawText": "exact visible text for this leg",
      "eventName": "team/player names for this leg without the live phase prefix",
      "marketType": "market shown for this leg, or null",
      "selection": "selected outcome for this leg",
      "odds": 1.19,
      "sport": "soccer|tennis|cs2|basketball|ice_hockey|mma|other|null",
      "isLive": true,
      "periodOrPhase": "3-й сет / Перерва / 1-й сет / null",
      "statusText": "visible status text, or null",
      "scoreText": "visible score, or null",
      "statusSource": "coupon|unknown",
      "statusConfidence": 0.95
    }
  ]
}

Legacy final schema is still accepted:

Required format:
{
  "event_name":  "For single bet: exact team names. For express/parlay: all legs joined with ' + ', e.g. 'Team A vs Team B + Team C vs Team D'",
  "market_type": "For single bet: market as shown. For express/parlay: 'Экспресс' or 'Express' with leg count, e.g. 'Экспресс (2 ноги)'",
  "selection":   "For single bet: selected outcome. For express: summary of all selections, e.g. 'Менше (2.5) + Більше (2.5)', or null",
  "odds":        1.96,
  "stake":       null,
  "bookmaker":   "bookmaker name, or null",
  "sport":       "soccer|tennis|cs2|basketball|ice_hockey|mma|other",
  "legs": [
    {
      "rawText": "exact text for this leg",
      "eventName": "team/player names for this leg without the live phase prefix",
      "marketType": "market shown for this leg, or null",
      "selection": "selected outcome for this leg",
      "odds": 1.19,
      "sport": "soccer|tennis|cs2|basketball|ice_hockey|mma|other|null",
      "isLive": true,
      "periodOrPhase": "3-й сет / Перерва / 1-й сет / null",
      "statusText": "visible status text, or null",
      "scoreText": "visible score, or null",
      "statusSource": "coupon|unknown",
      "statusConfidence": 0.95
    }
  ]
}

Rules:
- Read team names letter-by-letter exactly as shown
- odds must be the FINAL/TOTAL combined odds shown on the coupon (e.g. 1.96 for express), as a number never a string
- For express/parlay: use the total combined coefficient, not individual leg odds
- stake is usually not printed on coupons — return null unless clearly visible
- Return null for any field not clearly visible
- sport should reflect the dominant sport on the coupon
- For express/parlay coupons, preserve every leg in legs[] instead of only flattening the event and selection
- Infer sport per leg; do not blindly apply the dominant sport to every leg
- If a leg visibly says Лайв, Live, In-play, 1-й сет, 2-й сет, 3-й сет, Перерва, or Halftime, set isLive=true and statusSource="coupon"
- Return ONLY the JSON object, nothing else`

const FALLBACK_SCAN_PROMPT = `You are doing a second-pass OCR extraction for a betting coupon screenshot.

Return ONLY JSON. Do not explain. Do not return empty legs if a coupon card is visible.

Focus on the visible coupon cards and preserve line order. For each visible card:
- read the pink live marker (Лайв / Live)
- read the phase line, e.g. "3-й сет, Player A - Player B" or "Перерва, Team A - Team B"
- read the market line, e.g. "Переможець" or "Результат матчу"
- read the selected outcome line
- read the individual odds shown on the right

Use this exact shape:
{
  "rawText": "all visible text in line order",
  "couponType": "express",
  "totalOdds": 7.253,
  "warnings": [],
  "legs": [
    {
      "rawText": "visible text for this card",
      "eventName": "event names without phase prefix",
      "marketType": "market line",
      "selection": "selected outcome",
      "odds": 1.19,
      "sport": "tennis|soccer|other|null",
      "isLive": true,
      "periodOrPhase": "3-й сет / Перерва / 1-й сет",
      "statusText": "Лайв",
      "scoreText": null,
      "statusSource": "coupon",
      "statusConfidence": 0.95
    }
  ]
}

Rules:
- 1-й/2-й/3-й сет means tennis.
- Перерва / Halftime means soccer.
- Total odds are shown near "Загальний коефіцієнт" / "Total odds".
- If a field is unreadable, use null for that field but keep the leg object.`

function shouldExposeScannerDebug() {
  return process.env.NODE_ENV !== 'production' || process.env.VERCEL_ENV === 'preview'
}

function scannerFailurePayload(stage: ScannerParseStage, missingFields: string[] = []) {
  const failure = buildScannerFailureResponse(stage, missingFields)
  if (shouldExposeScannerDebug()) return failure
  return { error: failure.error }
}

function shouldRetryScannerParse(err: unknown) {
  const stage = (err as { scannerParseStage?: ScannerParseStage }).scannerParseStage
  const missingFields = (err as { missingFields?: string[] }).missingFields ?? []
  return stage === 'normalization' && missingFields.includes('legs')
}

async function callAnthropicScanner(
  apiKey: string,
  image: string,
  media_type: z.infer<typeof requestSchema>['media_type'],
  prompt: string
) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1200,
      temperature: 0,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image', source: { type: 'base64', media_type, data: image } },
        ],
      }],
    }),
  })

  if (!response.ok) {
    const err = await response.text()
    console.error('[scanner] Anthropic error:', err)
    throw Object.assign(new Error('scanner_api_error'), { scannerParseStage: 'vision_response' as ScannerParseStage })
  }

  const data = await response.json()
  return data.content
    ?.filter((block: { type?: string; text?: string }) => block.type === 'text' && block.text)
    .map((block: { text: string }) => block.text)
    .at(-1) ?? ''
}

// ─── Schemas ─────────────────────────────────────────────────
const requestSchema = z.object({
  image:      z.string().min(1, 'Image is required'),
  media_type: z.enum(ALLOWED_MEDIA_TYPES).default('image/jpeg'),
})

const scanOutputSchema = z.object({
  event_name:  z.string().nullable().optional(),
  market_type: z.string().nullable().optional(),
  selection:   z.string().nullable().optional(),
  odds:        z.number().nullable().optional(),
  stake:       z.number().nullable().optional(),
  bookmaker:   z.string().nullable().optional(),
  // Accept both legacy and canonical sport values — mapped to canonical in the handler
  sport: z.enum([
    'soccer', 'tennis', 'cs2', 'basketball', 'ice_hockey', 'mma', 'other',
    'football', 'hockey', // legacy — mapped below
  ]).nullable().optional(),
  legs: z.array(z.object({
    rawText:          z.string().nullable().optional(),
    eventName:        z.string().nullable().optional(),
    marketType:       z.string().nullable().optional(),
    selection:        z.string().nullable().optional(),
    odds:             z.number().nullable().optional(),
    sport:            z.enum([
      'soccer', 'tennis', 'cs2', 'basketball', 'ice_hockey', 'mma', 'other',
      'football', 'hockey',
    ]).nullable().optional(),
    isLive:           z.boolean().optional(),
    periodOrPhase:    z.string().nullable().optional(),
    statusText:       z.string().nullable().optional(),
    scoreText:        z.string().nullable().optional(),
    statusSource:     z.enum(['coupon', 'unknown']).optional(),
    statusConfidence: z.number().min(0).max(1).nullable().optional(),
  })).optional(),
})

// ─── Handler ─────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  // Auth check
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const rateCheck = await enforceRateLimit(`scanner:${user.id}`, RATE_LIMITS.scanner())
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { error: 'Too many scans — please wait before trying again' },
      { status: 429, headers: { 'Retry-After': String(rateCheck.retryAfter || 60) } }
    )
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'Scanner not configured (missing API key)' }, { status: 503 })
  }

  // Parse + validate request
  let rawBody: unknown
  try {
    rawBody = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = requestSchema.safeParse(rawBody)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
  }

  const { image, media_type } = parsed.data

  // Size guard (~7.5MB original)
  if (image.length > MAX_BASE64_CHARS) {
    await trackServerEvent(user.id, EVENTS.SCANNER_FAILED, { error_type: 'too_large' })
    return NextResponse.json({ error: 'Image too large (max ~7.5 MB)' }, { status: 413 })
  }

  await trackServerEvent(user.id, EVENTS.SCANNER_STARTED, { media_type })

  // Call Claude Vision
  let raw: string
  try {
    raw = await callAnthropicScanner(apiKey, image, media_type, SCAN_PROMPT)
  } catch (err) {
    console.error('[scanner] fetch error:', err)
    await trackServerEvent(user.id, EVENTS.SCANNER_FAILED, { error_type: 'api_error' })
    return NextResponse.json({ error: 'Scanner API error' }, { status: 502 })
  }

  // Parse loose scanner output, then normalize to the strict app schema.
  let normalizedData: unknown
  try {
    normalizedData = normalizeLooseCouponExtraction(parseScannerVisionResult(raw))
  } catch (err) {
    if (shouldRetryScannerParse(err)) {
      try {
        const fallbackRaw = await callAnthropicScanner(apiKey, image, media_type, FALLBACK_SCAN_PROMPT)
        normalizedData = normalizeLooseCouponExtraction(parseScannerVisionResult(fallbackRaw))
      } catch (fallbackErr) {
        const stage = (fallbackErr as { scannerParseStage?: ScannerParseStage }).scannerParseStage ?? 'normalization'
        const missingFields = (fallbackErr as { missingFields?: string[] }).missingFields ?? []
        console.error('[scanner] fallback parse/normalization failed:', { stage, missingFields })
        await trackServerEvent(user.id, EVENTS.SCANNER_FAILED, { error_type: 'parse_failed' })
        return NextResponse.json(scannerFailurePayload(stage, missingFields), { status: 422 })
      }
    } else {
      const stage = (err as { scannerParseStage?: ScannerParseStage }).scannerParseStage ?? 'normalization'
      const missingFields = (err as { missingFields?: string[] }).missingFields ?? []
      console.error('[scanner] parse/normalization failed:', { stage, missingFields })
      await trackServerEvent(user.id, EVENTS.SCANNER_FAILED, { error_type: 'parse_failed' })
      return NextResponse.json(scannerFailurePayload(stage, missingFields), { status: 422 })
    }
  }

  // Validate shape with Zod
  const validated = scanOutputSchema.safeParse(normalizedData)
  if (!validated.success) {
    const missingFields = validated.error.issues.map(issue => issue.path.join('.') || issue.message)
    console.error('[scanner] Output schema mismatch:', missingFields)
    await trackServerEvent(user.id, EVENTS.SCANNER_FAILED, { error_type: 'schema_mismatch' })
    return NextResponse.json(scannerFailurePayload('schema_validation', missingFields), { status: 422 })
  }

  // Remap legacy sport values to canonical SportCode
  const SPORT_MAP: Record<string, string> = { football: 'soccer', hockey: 'ice_hockey' }
  const data = validated.data
  if (data.sport && SPORT_MAP[data.sport]) {
    data.sport = SPORT_MAP[data.sport] as typeof data.sport
  }
  if (data.legs?.length) {
    data.legs = data.legs.map(leg => ({
      ...leg,
      sport: leg.sport && SPORT_MAP[leg.sport] ? SPORT_MAP[leg.sport] as typeof leg.sport : leg.sport,
    }))
  }

  const isExpress = !!(
    data.market_type?.toLowerCase().includes('express') ||
    data.market_type?.toLowerCase().includes('экспресс') ||
    data.market_type?.toLowerCase().includes('parlay')
  )

  const events: Promise<void>[] = [
    trackServerEvent(user.id, EVENTS.SCANNER_COMPLETED, {
      sport:      data.sport ?? null,
      has_odds:   data.odds != null,
      has_stake:  data.stake != null,
      is_express: isExpress,
    }),
  ]
  if (isExpress) {
    events.push(trackServerEvent(user.id, EVENTS.SCANNER_EXPRESS_DETECTED, { sport: data.sport ?? null }))
  }
  await Promise.all(events)

  return NextResponse.json({ success: true, data })
}
