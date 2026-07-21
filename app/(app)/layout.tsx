import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AppHeader from '@/components/ui/AppHeader'
import MobileNav from '@/components/ui/MobileNav'
import { AnalyticsIdentify } from '@/lib/analytics/AnalyticsIdentify'
import FeedbackWidget from '@/components/feedback/FeedbackWidget'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return (
    <div className="web-editorial flex h-dvh flex-col overflow-hidden bg-[var(--night)]">
      <AnalyticsIdentify userId={user.id} />

      <AppHeader user={user} />

      <main className="min-w-0 flex-1 overflow-y-auto">
        <div className="editorial-page mx-auto min-h-full w-full max-w-[1600px] border-x border-[var(--border-subtle)] px-4 pb-24 pt-4 md:px-8 md:pb-10 md:pt-8">
          {children}
        </div>
      </main>

      <MobileNav />
      <FeedbackWidget />
    </div>
  )
}
