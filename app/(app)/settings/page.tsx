import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import SettingsForm from './SettingsForm'
import { PageView } from '@/lib/analytics/PageView'
import { EVENTS } from '@/lib/analytics/events'
import type { Profile } from '@/types'

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  return (
    <div className="bn-page flex flex-col gap-6">
      <PageView event={EVENTS.SETTINGS_PAGE_VIEWED} />
      <div>
        <p className="editorial-kicker">Control room</p>
        <h1 className="mt-2 font-display text-3xl font-black text-[var(--text-primary)]">Settings</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">Account details, currency, and app preferences.</p>
      </div>
      {profile ? (
        <SettingsForm profile={profile as Profile} email={user.email ?? ''} />
      ) : (
        <div className="bn-panel border-[var(--negative)] px-5 py-12 text-center">
          <p className="text-sm font-bold text-[var(--negative)]">× Could not load profile</p>
          <p className="mt-2 text-xs text-[var(--text-muted)]">Try refreshing the page. If the problem persists, contact support.</p>
        </div>
      )}
    </div>
  )
}
