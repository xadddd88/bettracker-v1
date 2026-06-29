import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function PATCH() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })

    const { error } = await supabase
      .from('profiles')
      .update({
        onboarding_completed: true,
        onboarding_stage:     'completed',
        updated_at:           new Date().toISOString(),
      })
      .eq('id', user.id)

    if (error) {
      console.error('[onboarding] update failed:', error.message)
      return NextResponse.json({ success: false, error: 'Failed to update' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    console.error('[onboarding] unhandled error:', err instanceof Error ? err.name : 'unknown')
    return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500 })
  }
}
