import { createClient } from '@/lib/supabase/server'
import CoachView from './CoachView'
import BetaNote from '@/components/ui/BetaNote'
import { PageView } from '@/lib/analytics/PageView'
import { EVENTS } from '@/lib/analytics/events'
import type { CoachingSession } from '@/types'
import { BroadcastPanel } from '@/components/ui/BroadcastNoir'

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
    <main className="bn-page mx-auto flex w-full max-w-3xl flex-col gap-4 pb-8">
      <PageView event={EVENTS.COACH_PAGE_VIEWED} />
      <BroadcastPanel className="p-5 sm:p-7">
        <p className="editorial-kicker">Retrospective · persisted history</p>
        <h1 className="mt-3 font-display text-[clamp(2.75rem,8vw,6rem)] font-black leading-none tracking-[-0.06em] text-bn-text">Coach</h1>
        <p className="mt-4 text-sm leading-6 text-bn-muted">
          AI-powered retrospective review of your settled bets — patterns, leaks, and actionable advice.
        </p>
      </BroadcastPanel>
      {settledBetsCount < 5 && (
        <BetaNote>
          Coach works best with at least 5 settled bets. You have {settledBetsCount} so far — results improve as your history grows.
        </BetaNote>
      )}
      <CoachView initialSessions={sessions} settledBetsCount={settledBetsCount} />
    </main>
  )
}
