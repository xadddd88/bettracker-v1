import { createClient } from '@/lib/supabase/server'
import CoachView from './CoachView'
import { PageView } from '@/lib/analytics/PageView'
import { EVENTS } from '@/lib/analytics/events'
import type { CoachingSession } from '@/types'

export default async function CoachPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [sessionsRes, settledRes] = await Promise.all([
    supabase
      .from('coaching_sessions')
      .select('*')
      .eq('user_id', user!.id)
      .order('created_at', { ascending: false })
      .limit(10),
    supabase
      .from('bets')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user!.id)
      .in('status', ['won', 'lost', 'void']),
  ])

  const sessions = (sessionsRes.data ?? []) as CoachingSession[]
  const settledBetsCount = settledRes.count ?? 0

  return (
    <div className="max-w-2xl flex flex-col gap-6">
      <PageView event={EVENTS.COACH_PAGE_VIEWED} />
      <div>
        <h1 className="text-2xl font-bold text-white">Coach</h1>
        <p className="text-sm text-gray-500 mt-1">Retrospective performance analysis</p>
      </div>
      <CoachView initialSessions={sessions} settledBetsCount={settledBetsCount} />
    </div>
  )
}
