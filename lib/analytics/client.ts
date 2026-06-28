import posthog from 'posthog-js'

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

export function trackClientEvent(event: string, props: Record<string, unknown> = {}): void {
  posthog.capture(event, sanitize(props))
}

export function identifyAnalyticsUser(userId: string, traits: Record<string, unknown> = {}): void {
  posthog.identify(userId, sanitize(traits))
}
