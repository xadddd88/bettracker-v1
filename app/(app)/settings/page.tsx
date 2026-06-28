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
    <div className="flex flex-col gap-6">
      <PageView event={EVENTS.SETTINGS_PAGE_VIEWED} />
      <div>
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="text-sm text-gray-500 mt-1">Profile and preferences</p>
      </div>
      {profile ? (
        <SettingsForm profile={profile as Profile} email={user.email ?? ''} />
      ) : (
        <div className="card text-center py-12 text-red-400 text-sm">
          Failed to load profile. Please refresh.
        </div>
      )}
    </div>
  )
}
