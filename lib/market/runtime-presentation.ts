import 'server-only'

import type { UiLocale } from '@/lib/i18n/ui-locale'

import { resolveMarketEligibilityPresentation } from './presentation'
import { isGbEwScMarketProfileEnabled } from './server-policy'

/**
 * Package C has no persisted Package B eligibility decision to read yet. This
 * server boundary may therefore expose only configuration state: disabled by
 * default, or unavailable if the activation flag is raised before that decision
 * source exists. Neither branch can grant market access.
 */
export function resolveCurrentMarketAccessPresentation(locale: UiLocale) {
  return resolveMarketEligibilityPresentation({
    locale,
    status: 'blocked',
    reason: isGbEwScMarketProfileEnabled()
      ? 'policy_state_unavailable'
      : 'market_not_enabled',
  })
}
