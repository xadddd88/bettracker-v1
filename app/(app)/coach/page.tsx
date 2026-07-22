import { createClient } from '@/lib/supabase/server'
import CoachView from './CoachView'
import BetaNote from '@/components/ui/BetaNote'
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
      .is('archived_at', null)
      .in('status', ['won', 'lost', 'void']),
  ])

  const sessions = (sessionsRes.data ?? []) as CoachingSession[]
  const settledBetsCount = settledRes.count ?? 0

  return (
    <div className="bn-page max-w-3xl flex flex-col gap-6">
      <PageView event={EVENTS.COACH_PAGE_VIEWED} />
      <div>
        <p className="editorial-kicker">Retrospective desk</p>
        <h1 className="mt-2 font-display text-3xl font-black text-[var(--text-primary)]">Coach</h1>
        <p className="mt-2 max-w-2xl text-sm text-[var(--text-muted)]">
          AI-powered retrospective review of your settled bets — patterns, leaks, and actionable advice.
        </p>
      </div>
      {settledBetsCount < 5 && (
        <BetaNote>
          Coach works best with at least 5 settled bets. You have {settledBetsCount} so far — results improve as your history grows.
        </BetaNote>
      )}
      <CoachView initialSessions={sessions} settledBetsCount={settledBetsCount} />
    </div>
  )
}
