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
    <div className="max-w-2xl flex flex-col gap-6">
      <PageView event={EVENTS.SCOUT_PAGE_VIEWED} />
      <div>
        <h1 className="text-2xl font-bold text-white">Scout</h1>
        <p className="text-sm text-gray-500 mt-1">Find markets worth analysing</p>
      </div>
      <ScoutForm initialOpportunities={opportunities} pulsePresets={pulsePresets} />
    </div>
  )
}
