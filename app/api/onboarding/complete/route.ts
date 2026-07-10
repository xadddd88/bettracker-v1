import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Decision #048: profiles is SELECT-only for authenticated after
// migration 018 — the onboarding flag is set via the
// complete_onboarding() RPC instead of a direct UPDATE.
export async function PATCH() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })

    const { error } = await supabase.rpc('complete_onboarding')

    if (error) {
      console.error('[onboarding] complete_onboarding failed:', error.message)
      return NextResponse.json({ success: false, error: 'Failed to update' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    console.error('[onboarding] unhandled error:', err instanceof Error ? err.name : 'unknown')
    return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500 })
  }
}
