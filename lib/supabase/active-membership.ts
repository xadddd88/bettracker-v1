import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'

const ACTIVE_MEMBERSHIP_TIMEOUT_MS = 5_000

type MembershipRow = {
  status: unknown
  used_by_user_id: unknown
}

export type ActiveMembershipResult =
  | { status: 'active' }
  | { status: 'inactive' }
  | { status: 'unavailable' }

const UNAVAILABLE: ActiveMembershipResult = { status: 'unavailable' }

/**
 * Resolve live product membership for one already-verified Supabase Auth user.
 *
 * This service-role client is used only for the authorization lookup. Domain
 * reads and writes must continue through the verified user's own client so the
 * existing ownership and RLS boundaries remain in force.
 */
export async function checkActiveMembership(userId: string): Promise<ActiveMembershipResult> {
  if (!userId) return UNAVAILABLE

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), ACTIVE_MEMBERSHIP_TIMEOUT_MS)

  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('beta_access')
      .select('status, used_by_user_id')
      .eq('used_by_user_id', userId)
      .limit(2)
      .abortSignal(controller.signal)

    if (error || !Array.isArray(data)) return UNAVAILABLE
    if (data.length === 0) return { status: 'inactive' }
    if (data.length !== 1) return UNAVAILABLE

    const row = data[0] as MembershipRow | null
    if (!row || typeof row.status !== 'string' || typeof row.used_by_user_id !== 'string') {
      return UNAVAILABLE
    }

    return row.status === 'used' && row.used_by_user_id === userId
      ? { status: 'active' }
      : { status: 'inactive' }
  } catch {
    return UNAVAILABLE
  } finally {
    clearTimeout(timeout)
  }
}
