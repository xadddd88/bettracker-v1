import { PostHog } from 'posthog-node'
import { sanitize } from './sanitize'

function makeClient(): PostHog | null {
  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return null
  return new PostHog(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
    host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://eu.i.posthog.com',
    flushAt: 1,
    flushInterval: 0,
  })
}

export async function trackServerEvent(
  distinctId: string,
  event: string,
  props: Record<string, unknown> = {},
): Promise<void> {
  try {
    const ph = makeClient()
    if (!ph) return
    ph.capture({ distinctId, event, properties: sanitize(props) })
    await ph.shutdown()
  } catch (err) {
    console.error('[analytics:server]', err)
  }
}
