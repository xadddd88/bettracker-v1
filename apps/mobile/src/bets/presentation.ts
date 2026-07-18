import type { BetStatus } from '@/bets/models';
import { colors } from '@/ui/theme';

export const STATUS_PRESENTATION: Record<BetStatus, { color: string; label: string }> = {
  cashed_out: { color: '#c084fc', label: 'Cashed out' },
  lost: { color: colors.danger, label: 'Lost' },
  partial: { color: colors.secondaryText, label: 'Partial' },
  pending: { color: colors.warning, label: 'Pending' },
  push: { color: '#60a5fa', label: 'Push' },
  unknown: { color: colors.muted, label: 'Unknown' },
  void: { color: colors.muted, label: 'Void' },
  won: { color: colors.success, label: 'Won' },
};
