import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

// ─── Constants ───────────────────────────────────────────────
const ALLOWED_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const
const MAX_BASE64_CHARS = 10 * 1024 * 1024 // ~7.5 MB original image

const SCAN_PROMPT = `You are a betting slip OCR expert. Analyze this screenshot of a betting coupon or slip.

Read ALL text EXACTLY character-by-character as shown in the image. Do NOT guess or correct team names.

Extract the bet details and return ONLY a valid JSON object — no explanation, no markdown, no code fences.

Required format:
{
  "event_name":  "exact team names as shown, e.g. Germany vs Netherlands",
  "market_type": "market as shown, e.g. П1, ТБ 2.5, Ф1 +1, 1X2",
  "selection":   "selected outcome, or null",
  "odds":        1.85,
  "stake":       null,
  "bookmaker":   "bookmaker name, or null",
  "sport":       "football|tennis|basketball|hockey|other"
}

Rules:
- Read team names letter-by-letter exactly as shown
- odds must be a number (e.g. 1.85), never a string
- stake is usually not printed on coupons — return null unless clearly visible
- Return null for any field not clearly visible
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
  sport:       z.enum(['football', 'tennis', 'basketball', 'hockey', 'other']).nullable().optional(),
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
    return NextResponse.json({ error: 'Image too large (max ~7.5 MB)' }, { status: 413 })
  }

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
      return NextResponse.json({ error: 'Scanner API error' }, { status: 502 })
    }

    const data = await response.json()
    raw = data.content?.[0]?.text ?? ''
  } catch (err) {
    console.error('[scanner] fetch error:', err)
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
    return NextResponse.json({ error: 'Could not parse scanner result' }, { status: 500 })
  }

  // Validate shape with Zod
  const validated = scanOutputSchema.safeParse(jsonData)
  if (!validated.success) {
    console.error('[scanner] Output schema mismatch:', jsonData)
    return NextResponse.json({ error: 'Unexpected scanner output format' }, { status: 500 })
  }

  // TODO Sprint 2: log result to ai_analysis_runs table for audit trail

  return NextResponse.json({ success: true, data: validated.data })
}
