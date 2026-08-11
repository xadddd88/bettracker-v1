import { NextResponse } from 'next/server'
import {
  activeMemberAuthErrorResponse,
  authenticateActiveMemberRequest,
} from '@/lib/supabase/request-auth'

// Decision #048: profiles is SELECT-only for authenticated after
// migration 018 — the onboarding flag is set via the
// complete_onboarding() RPC instead of a direct UPDATE.
export async function PATCH(req: Request) {
  try {
    const auth = await authenticateActiveMemberRequest(req)
    if (!auth.authorized) return activeMemberAuthErrorResponse(auth)
    const { supabase } = auth

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
