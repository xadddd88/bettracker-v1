import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { trackServerEvent } from '@/lib/analytics/server'
import { EVENTS } from '@/lib/analytics/events'

// ─── Constants ───────────────────────────────────────────────
const ALLOWED_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const
const MAX_BASE64_CHARS = 10 * 1024 * 1024 // ~7.5 MB original image

const SCAN_PROMPT = `You are a betting slip OCR expert. Analyze this screenshot of a betting coupon or slip.

Read ALL text EXACTLY character-by-character as shown in the image. Do NOT guess or correct team names.

The coupon may be a SINGLE bet or an EXPRESS/PARLAY (multiple legs combined).

Return ONLY a valid JSON object — no explanation, no markdown, no code fences.

Required format:
{
  "event_name":  "For single bet: exact team names. For express/parlay: all legs joined with ' + ', e.g. 'Team A vs Team B + Team C vs Team D'",
  "market_type": "For single bet: market as shown. For express/parlay: 'Экспресс' or 'Express' with leg count, e.g. 'Экспресс (2 ноги)'",
  "selection":   "For single bet: selected outcome. For express: summary of all selections, e.g. 'Менше (2.5) + Більше (2.5)', or null",
  "odds":        1.96,
  "stake":       null,
  "bookmaker":   "bookmaker name, or null",
  "sport":       "soccer|tennis|cs2|basketball|ice_hockey|mma|other"
}

Rules:
- Read team names letter-by-letter exactly as shown
- odds must be the FINAL/TOTAL combined odds shown on the coupon (e.g. 1.96 for express), as a number never a string
- For express/parlay: use the total combined coefficient, not individual leg odds
- stake is usually not printed on coupons — return null unless clearly visible
- Return null for any field not clearly visible
- sport should reflect the dominant sport on the coupon
- Return ONLY the JSON object, nothing else`

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
})

// ─── Handler ─────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  // Auth check
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 512,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type, data: image } },
            { type: 'text', text: SCAN_PROMPT },
          ],
        }],
      }),
    })

    if (!response.ok) {
      const err = await response.text()
      console.error('[scanner] Anthropic error:', err)
      await trackServerEvent(user.id, EVENTS.SCANNER_FAILED, { error_type: 'api_error' })
      return NextResponse.json({ error: 'Scanner API error' }, { status: 502 })
    }

    const data = await response.json()
    raw = data.content?.[0]?.text ?? ''
  } catch (err) {
    console.error('[scanner] fetch error:', err)
    await trackServerEvent(user.id, EVENTS.SCANNER_FAILED, { error_type: 'unknown' })
    return NextResponse.json({ error: 'Scanner request failed' }, { status: 500 })
  }

  // Strip markdown fences if model wrapped output
  const cleaned = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim()

  // Parse JSON
  let jsonData: unknown
  try {
    jsonData = JSON.parse(cleaned)
  } catch {
    console.error('[scanner] JSON parse failed:', raw)
    await trackServerEvent(user.id, EVENTS.SCANNER_FAILED, { error_type: 'parse_failed' })
    return NextResponse.json({ error: 'Could not parse scanner result' }, { status: 500 })
  }

  // Validate shape with Zod
  const validated = scanOutputSchema.safeParse(jsonData)
  if (!validated.success) {
    console.error('[scanner] Output schema mismatch:', jsonData)
    await trackServerEvent(user.id, EVENTS.SCANNER_FAILED, { error_type: 'schema_mismatch' })
    return NextResponse.json({ error: 'Unexpected scanner output format' }, { status: 500 })
  }

  // Remap legacy sport values to canonical SportCode
  const SPORT_MAP: Record<string, string> = { football: 'soccer', hockey: 'ice_hockey' }
  const data = validated.data
  if (data.sport && SPORT_MAP[data.sport]) {
    data.sport = SPORT_MAP[data.sport] as typeof data.sport
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
