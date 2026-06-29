import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { trackServerEvent } from '@/lib/analytics/server'
import { EVENTS } from '@/lib/analytics/events'

const feedbackSchema = z.object({
  rating:   z.number().int().min(1).max(5),
  category: z.enum(['bug', 'suggestion', 'general', 'praise']),
  message:  z.string().max(2000).optional(),
})

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const parsed = feedbackSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid input', details: parsed.error.flatten() },
        { status: 400 },
      )
    }

    const { rating, category, message } = parsed.data

    const { error } = await supabase
      .from('beta_feedback')
      .insert({ user_id: user.id, rating, category, message: message ?? null })

    if (error) {
      console.error('[feedback] insert failed:', error.message)
      return NextResponse.json({ success: false, error: 'Failed to submit' }, { status: 500 })
    }

    // Track rating + category only — never the message text
    await trackServerEvent(user.id, EVENTS.BETA_FEEDBACK_SUBMITTED, { rating, category })

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    console.error('[feedback] unhandled error:', err instanceof Error ? err.name : 'unknown')
    return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500 })
  }
}
