export const BLOCKED_KEYS = new Set([
  // Identity / contact
  'email',
  'api_key',
  'token',
  'authorization',
  // Raw text / prompts
  'notes',
  'prompt',
  'raw_prompt',
  'raw_event_text',
  'raw_market_text',
  'ocr_text',
  'ocr_image',
  'coupon_text',
  'image',
  'raw_text',
  // Identifying names
  'event_name',
  'team_name',
  'participant',
  'selection',
  // AI output text
  'reasoning',
  'disclaimer',
  // Financial raw values
  'stake',
  'pnl',
  'profit',
  'balance',
  'bankroll_balance',
])

export function sanitize(props: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, val] of Object.entries(props)) {
    if (!BLOCKED_KEYS.has(key)) out[key] = val
  }
  return out
}
