import type { BetStatus } from '@/bets/models';
import type { BroadcastStatusTone } from '@/ui/broadcast-noir-primitives';

export const STATUS_PRESENTATION: Record<BetStatus, { label: string; tone: BroadcastStatusTone }> = {
  cashed_out: { label: 'Cashed out', tone: 'neutral' },
  lost: { label: 'Lost', tone: 'negative' },
  partial: { label: 'Partial', tone: 'review' },
  pending: { label: 'Pending', tone: 'review' },
  push: { label: 'Push', tone: 'neutral' },
  unknown: { label: 'Unknown', tone: 'neutral' },
  void: { label: 'Void', tone: 'neutral' },
  won: { label: 'Won', tone: 'success' },
};
