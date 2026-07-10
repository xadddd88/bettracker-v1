import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

// Decision #049: only genuine user actions are accepted here. System
// transitions ('discovered', 'research_needed', 'expired') are not
// client-reachable.
const patchSchema = z.object({
  status: z.enum(['watchlisted', 'dismissed', 'converted_to_decision']),
  linked_decision_id: z.string().uuid().optional(),
})

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    if (!z.string().uuid().safeParse(id).success) {
      return NextResponse.json({ success: false, error: 'Invalid id' }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const parsed = patchSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: 'Invalid input' }, { status: 400 })
    }

    // Decision #049: market_opportunities is SELECT-only for
    // authenticated after migration 020 — the status change goes through
    // update_opportunity_status (auth.uid()-scoped, ownership enforced).
    const { error } = await supabase.rpc('update_opportunity_status', {
      p_opportunity_id:     id,
      p_status:             parsed.data.status,
      p_linked_decision_id: parsed.data.linked_decision_id ?? null,
    })

    if (error) {
      const m = error.message
      if (/opportunity_not_found/.test(m)) {
        return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 })
      }
      if (/invalid_transition/.test(m)) {
        return NextResponse.json({ success: false, error: 'Invalid transition' }, { status: 409 })
      }
      if (/invalid_status|link_required|invalid_link|link_not_allowed/.test(m)) {
        return NextResponse.json({ success: false, error: 'Invalid request' }, { status: 400 })
      }
      console.error('[scout-patch] update_opportunity_status failed:', m)
      return NextResponse.json({ success: false, error: 'Failed to update' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    console.error('[scout-patch] unhandled error:', err instanceof Error ? err.name : 'unknown')
    return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500 })
  }
}
