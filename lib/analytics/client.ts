import posthog from 'posthog-js'
import { sanitize } from './sanitize'

export function trackClientEvent(event: string, props: Record<string, unknown> = {}): void {
  if (typeof window === 'undefined') return
  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY || !process.env.NEXT_PUBLIC_POSTHOG_HOST) return
  try {
    posthog.capture(event, sanitize(props))
  } catch (err) {
    console.error('[analytics:client]', err)
  }
}

export function identifyAnalyticsUser(userId: string, traits: Record<string, unknown> = {}): void {
  if (typeof window === 'undefined') return
  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY || !process.env.NEXT_PUBLIC_POSTHOG_HOST) return
  try {
    posthog.identify(userId, sanitize(traits))
  } catch (err) {
    console.error('[analytics:client]', err)
  }
}
