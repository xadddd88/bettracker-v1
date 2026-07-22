/**
 * Resolve the one actionable Home state from facts the product already owns.
 * A draft is never inferred: callers may set draftAvailable only when a
 * persisted, recoverable draft actually exists.
 */
export function resolveAdaptiveAction({ draftAvailable, pendingCount }) {
  if (draftAvailable) {
    return {
      detail: 'Return to the saved form and verify every field before saving.',
      href: '/bets/new',
      kind: 'continue_draft',
      label: 'Continue draft',
      meta: 'Unsaved tracker draft',
    }
  }

  if (pendingCount > 0) {
    return {
      detail: 'Confirm only outcomes you know. Unresolved records remain untouched.',
      href: '/bets',
      kind: 'review_pending',
      label: `Review ${pendingCount} pending bet${pendingCount === 1 ? '' : 's'}`,
      meta: `${pendingCount} record${pendingCount === 1 ? '' : 's'} need attention`,
    }
  }

  return {
    detail: 'Capture the coupon, verify every leg, then decide what to track.',
    href: '/ai',
    kind: 'scan_coupon',
    label: 'Scan coupon',
    meta: 'No pending records',
  }
}
