import { PostHog } from 'posthog-node'

const BLOCKED_KEYS = new Set([
  'email',
  'notes',
  'prompt',
  'ocr_text',
  'event_name',
  'selection',
  'reasoning',
  'disclaimer',
  'image',
  'raw_text',
  'stake',
  'pnl',
  'balance',
])

function sanitize(props: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, val] of Object.entries(props)) {
    if (!BLOCKED_KEYS.has(key)) out[key] = val
  }
  return out
}

function makeClient(): PostHog {
  return new PostHog(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
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
    ph.capture({ distinctId, event, properties: sanitize(props) })
    await ph.shutdown()
  } catch (err) {
    console.error('[analytics:server]', err)
  }
}
