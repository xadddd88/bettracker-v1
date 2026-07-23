import { createClient } from '@/lib/supabase/server'
import ScoutForm from './ScoutForm'
import { PageView } from '@/lib/analytics/PageView'
import { EVENTS } from '@/lib/analytics/events'
import type { MarketOpportunity } from '@/types'
import { getActiveScoutPresets } from '@/lib/events/pulse'
import { BroadcastPanel } from '@/components/ui/BroadcastNoir'

export default async function ScoutPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data } = await supabase
    .from('market_opportunities')
    .select('*')
    .eq('user_id', user!.id)
    .not('status', 'in', '("dismissed","expired")')
    .order('created_at', { ascending: false })
    .limit(20)

  const opportunities  = (data ?? []) as MarketOpportunity[]
  const today          = new Date().toISOString().slice(0, 10)
  const pulsePresets   = getActiveScoutPresets(today)

  return (
    <main className="bn-page mx-auto flex w-full max-w-3xl flex-col gap-4 pb-8">
      <PageView event={EVENTS.SCOUT_PAGE_VIEWED} />
      <BroadcastPanel className="p-5 sm:p-7">
        <p className="editorial-kicker">Research · candidate discovery</p>
        <h1 className="mt-3 font-display text-[clamp(2.75rem,8vw,6rem)] font-black leading-none tracking-[-0.06em] text-bn-text">Scout</h1>
        <p className="mt-4 text-sm leading-6 text-bn-muted">
          Research opportunity discovery — find markets that may have value, then analyse them in the AI Analyst.
        </p>
      </BroadcastPanel>
      <ScoutForm initialOpportunities={opportunities} pulsePresets={pulsePresets} />
    </main>
  )
}
