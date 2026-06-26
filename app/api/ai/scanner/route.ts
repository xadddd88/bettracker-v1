import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const SCAN_PROMPT = `You are a betting slip OCR expert. Analyze this screenshot of a betting coupon or slip.

Read ALL text EXACTLY character-by-character as shown in the image. Do NOT guess or correct team names.

Extract the bet details and return ONLY a valid JSON object (no explanation, no markdown):

{
  "event_name": "exact team names as shown, e.g. Germany vs Netherlands",
  "market_type": "market as shown, e.g. П1, ТБ 2.5, Ф1 +1, 1X2",
  "selection": "selected outcome or null",
  "odds": 1.85,
  "stake": null,
  "bookmaker": "bookmaker name or null",
  "sport": "football|tennis|basketball|hockey|other"
}

Rules:
- Read team names exactly as shown — letter by letter
- odds must be a number (e.g. 1.85), not a string
- stake is usually not on the coupon — return null unless clearly visible
- If a field is not visible, return null
- Return ONLY the JSON object, nothing else`

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

  let body: { image: string; media_type?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { image, media_type = 'image/jpeg' } = body
  if (!image) {
    return NextResponse.json({ error: 'No image provided' }, { status: 400 })
  }

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
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: media_type as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
                data: image,
              },
            },
            {
              type: 'text',
              text: SCAN_PROMPT,
            },
          ],
        }],
      }),
    })

    if (!response.ok) {
      const err = await response.text()
      console.error('Anthropic API error:', err)
      return NextResponse.json({ error: 'Scanner API error' }, { status: 502 })
    }

    const data = await response.json()
    const raw = data.content?.[0]?.text ?? ''

    // Strip markdown code fences if present
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()

    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(cleaned)
    } catch {
      console.error('Failed to parse scanner JSON:', raw)
      return NextResponse.json({ error: 'Could not parse scanner result' }, { status: 500 })
    }

    return NextResponse.json({ success: true, data: parsed })

  } catch (err) {
    console.error('Scanner error:', err)
    return NextResponse.json({ error: 'Scanner failed' }, { status: 500 })
  }
}
