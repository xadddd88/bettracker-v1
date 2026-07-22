import {
  MAX_DRAFT_LEGS,
  TRACKER_SPORTS,
  type TrackerDraft,
  type TrackerLegDraft,
  type TrackerSport,
} from '../bets/draft';
import type { ScannerAnalysis, ScannerLeg } from './scanner-model';

let pendingScannerDraft: TrackerDraft | null = null;

function supportedSport(value: string | null): TrackerSport {
  return TRACKER_SPORTS.includes(value as TrackerSport) ? value as TrackerSport : 'other';
}

function decimal(value: number | null): string {
  return value !== null && Number.isFinite(value) ? String(value) : '';
}

function cloneDraft(draft: TrackerDraft): TrackerDraft {
  return {
    ...draft,
    legs: draft.legs.map((leg) => ({ ...leg })),
  };
}

function flattenedLeg(analysis: ScannerAnalysis): ScannerLeg {
  return {
    eventName: analysis.eventName,
    marketType: analysis.marketType,
    odds: analysis.totalOdds,
    selection: analysis.selection,
    sport: analysis.sport,
  };
}

export function scannerAnalysisToTrackerDraft(analysis: ScannerAnalysis): TrackerDraft | null {
  const sourceLegs = analysis.legs.length > 0 ? analysis.legs : [flattenedLeg(analysis)];
  if (sourceLegs.length < 1 || sourceLegs.length > MAX_DRAFT_LEGS) return null;

  const legs: TrackerLegDraft[] = sourceLegs.map((leg, index) => ({
    eventName: leg.eventName ?? '',
    id: `scanner-leg-${index + 1}`,
    marketType: leg.marketType ?? '',
    odds: decimal(leg.odds),
    selection: leg.selection ?? '',
    sport: supportedSport(leg.sport ?? analysis.sport),
  }));

  return {
    bookmaker: analysis.bookmaker ?? '',
    legs,
    notes: '',
    stake: decimal(analysis.stake),
    totalOdds: legs.length > 1 ? decimal(analysis.totalOdds) : '',
  };
}

export function stageScannerDraft(draft: TrackerDraft): void {
  pendingScannerDraft = cloneDraft(draft);
}

export function consumeScannerDraft(): TrackerDraft | null {
  const draft = pendingScannerDraft ? cloneDraft(pendingScannerDraft) : null;
  pendingScannerDraft = null;
  return draft;
}
