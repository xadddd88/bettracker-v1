import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

const patchSchema = z.object({
  status: z.enum([
    'discovered', 'research_needed', 'watchlisted',
    'converted_to_decision', 'dismissed', 'expired',
  ]),
  linked_decision_id: z.string().uuid().optional(),
})

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
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
      if (/not found or does not belong/i.test(error.message)) {
        return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 })
      }
      console.error('[scout-patch] update_opportunity_status failed:', error.message)
      return NextResponse.json({ success: false, error: 'Failed to update' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Internal error'
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}
