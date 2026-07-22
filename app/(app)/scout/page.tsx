import { createClient } from '@/lib/supabase/server'
import ScoutForm from './ScoutForm'
import { PageView } from '@/lib/analytics/PageView'
import { EVENTS } from '@/lib/analytics/events'
import type { MarketOpportunity } from '@/types'
import { getActiveScoutPresets } from '@/lib/events/pulse'

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
    <div className="bn-page max-w-3xl flex flex-col gap-6">
      <PageView event={EVENTS.SCOUT_PAGE_VIEWED} />
      <div>
        <p className="editorial-kicker">Research desk</p>
        <h1 className="mt-2 font-display text-3xl font-black text-[var(--text-primary)]">Scout</h1>
        <p className="mt-2 max-w-2xl text-sm text-[var(--text-muted)]">
          Discover research candidates, verify the missing context, then move them to AI Analyst for a gated review.
        </p>
      </div>
      <ScoutForm initialOpportunities={opportunities} pulsePresets={pulsePresets} />
    </div>
  )
}
