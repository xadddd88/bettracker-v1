import { createClient } from '@/lib/supabase/server'
import { checkActiveMembership } from '@/lib/supabase/active-membership'
import { redirect } from 'next/navigation'
import AppHeader from '@/components/ui/AppHeader'
import MobileNav from '@/components/ui/MobileNav'
import { AnalyticsIdentify } from '@/lib/analytics/AnalyticsIdentify'
import FeedbackWidget from '@/components/feedback/FeedbackWidget'
import { checkTennisCalcAccess } from '@/lib/flags/tennis-calc'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const membership = await checkActiveMembership(user.id)
  if (membership.status === 'inactive') redirect('/access-denied')
  if (membership.status === 'unavailable') redirect('/service-unavailable')
  const tennisCalcEnabled = checkTennisCalcAccess(user.id).allowed

  return (
    <div className="web-editorial flex h-dvh flex-col overflow-hidden bg-[var(--night)]">
      <AnalyticsIdentify userId={user.id} />

      <AppHeader user={user} tennisCalcEnabled={tennisCalcEnabled} />

      <div className="min-w-0 flex-1 overflow-y-auto">
        <div className="editorial-page mx-auto min-h-full w-full max-w-[1600px] border-x border-[var(--border-subtle)] px-4 pb-24 pt-4 md:px-8 md:pb-10 md:pt-8">
          {children}
        </div>
      </div>

      <MobileNav tennisCalcEnabled={tennisCalcEnabled} />
      <FeedbackWidget />
    </div>
  )
}
