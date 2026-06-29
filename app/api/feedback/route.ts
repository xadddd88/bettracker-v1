import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { trackServerEvent } from '@/lib/analytics/server'
import { EVENTS } from '@/lib/analytics/events'

const feedbackSchema = z.object({
  feedback_type: z.enum(['bug', 'idea', 'confusing', 'other']),
  message:       z.string().min(1).max(2000),
  page_path:     z.string().max(200).optional(),
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

    const { feedback_type, message, page_path } = parsed.data

    const { error } = await supabase
      .from('beta_feedback')
      .insert({ user_id: user.id, feedback_type, message, page_path: page_path ?? null })

    if (error) {
      console.error('[feedback] insert failed:', error.message)
      return NextResponse.json({ success: false, error: 'Failed to submit' }, { status: 500 })
    }

    // Track type + page only — never the message text
    await trackServerEvent(user.id, EVENTS.BETA_FEEDBACK_SUBMITTED, {
      feedback_type,
      page_path: page_path ?? null,
    })

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    console.error('[feedback] unhandled error:', err instanceof Error ? err.name : 'unknown')
    return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500 })
  }
}
