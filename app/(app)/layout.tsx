import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/ui/Sidebar'
import MobileNav from '@/components/ui/MobileNav'
import { AnalyticsIdentify } from '@/lib/analytics/AnalyticsIdentify'
import FeedbackWidget from '@/components/feedback/FeedbackWidget'
import PulseThemeProvider from '@/components/pulse/PulseThemeProvider'
import { getPrimaryEvent } from '@/lib/events/pulse'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const today = new Date().toISOString().slice(0, 10)
  const primaryEvent = getPrimaryEvent(today)

  return (
    <>
      <PulseThemeProvider />
      <div className="flex h-screen overflow-hidden" style={{ background: 'var(--bg)' }}>
        <AnalyticsIdentify userId={user.id} />

        {/* Desktop sidebar — hidden on mobile */}
        <div className="hidden md:flex">
          <Sidebar user={user} primaryEvent={primaryEvent} />
        </div>

        <main className="flex-1 overflow-y-auto">
          {/* Extra bottom padding on mobile so content clears the bottom nav */}
          <div className="max-w-6xl mx-auto p-4 md:p-6 pb-20 md:pb-6">
            {children}
          </div>
        </main>

        {/* Mobile bottom nav — hidden on desktop */}
        <MobileNav />

        {/* Floating feedback button (all screen sizes) */}
        <FeedbackWidget />
      </div>
    </>
  )
}
