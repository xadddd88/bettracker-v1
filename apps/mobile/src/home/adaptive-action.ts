export type HomeAction = {
  detail: string;
  href: '/(app)/ai' | '/(app)/bets' | '/(app)/bets/new';
  kind: 'continue_draft' | 'review_pending' | 'scan_coupon';
  label: string;
  meta: string;
};

export function resolveHomeAction({
  draftAvailable,
  pendingCount,
}: {
  draftAvailable: boolean;
  pendingCount: number;
}): HomeAction {
  if (draftAvailable) {
    return {
      detail: 'Return to the saved form and verify every field before saving.',
      href: '/(app)/bets/new',
      kind: 'continue_draft',
      label: 'Continue draft',
      meta: 'Unsaved tracker draft',
    };
  }

  if (pendingCount > 0) {
    return {
      detail: 'Confirm only outcomes you know. Unresolved records remain untouched.',
      href: '/(app)/bets',
      kind: 'review_pending',
      label: `Review ${pendingCount} pending bet${pendingCount === 1 ? '' : 's'}`,
      meta: `${pendingCount} record${pendingCount === 1 ? '' : 's'} need attention`,
    };
  }

  return {
    detail: 'Capture the coupon, verify every leg, then decide what to track.',
    href: '/(app)/ai',
    kind: 'scan_coupon',
    label: 'Scan coupon',
    meta: 'No pending records',
  };
}
