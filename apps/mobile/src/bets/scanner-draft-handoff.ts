import type { ScannerAnalysis, ScannerLeg } from '@/ai/scanner-model';
import {
  MAX_DRAFT_LEGS,
  TRACKER_SPORTS,
  type TrackerDraft,
  type TrackerLegDraft,
  type TrackerSport,
} from '@/bets/draft';

export type ScannerDraftHandoff = {
  draft: TrackerDraft;
  needsReview: boolean;
};

let pendingHandoff: ScannerDraftHandoff | null = null;

function safeText(value: string | null, maxLength: number): string {
  const trimmed = value?.trim() ?? '';
  return trimmed.length <= maxLength ? trimmed : '';
}

function safeDecimal(value: number | null, minimumExclusive: number, maximum: number): string {
  return value !== null && Number.isFinite(value) && value > minimumExclusive && value <= maximum
    ? String(value)
    : '';
}

function trackerSport(value: string | null): TrackerSport {
  const normalized = value?.trim().toLowerCase() ?? '';
  return (TRACKER_SPORTS as readonly string[]).includes(normalized)
    ? normalized as TrackerSport
    : 'other';
}

function legDraft(leg: ScannerLeg, index: number): TrackerLegDraft {
  return {
    eventName: safeText(leg.eventName, 200),
    id: `scanner-leg-${index + 1}`,
    marketType: safeText(leg.marketType, 100),
    odds: safeDecimal(leg.odds, 1, 10_000),
    selection: safeText(leg.selection, 200),
    sport: trackerSport(leg.sport),
  };
}

function completeLeg(leg: TrackerLegDraft): boolean {
  return leg.eventName !== '' && leg.marketType !== '' && Number(leg.odds) > 1;
}

export function scannerAnalysisToTrackerDraft(analysis: ScannerAnalysis): ScannerDraftHandoff {
  const structuredLegs: ScannerLeg[] = analysis.legs.length > 0
    ? analysis.legs
    : [{
        eventName: analysis.eventName,
        marketType: analysis.marketType,
        odds: analysis.totalOdds,
        selection: analysis.selection,
        sport: analysis.sport,
      }];
  const legs = structuredLegs.length <= MAX_DRAFT_LEGS
    ? structuredLegs.map(legDraft)
    : [legDraft({ eventName: null, marketType: null, odds: null, selection: null, sport: null }, 0)];
  const stake = safeDecimal(analysis.stake, 0, 100_000_000);
  const totalOdds = legs.length >= 2 ? safeDecimal(analysis.totalOdds, 1, 100_000_000) : '';
  const bookmaker = safeText(analysis.bookmaker, 100);

  return {
    draft: {
      bookmaker,
      legs,
      notes: '',
      source: 'scanner',
      stake,
      totalOdds,
    },
    needsReview:
      analysis.legs.length > MAX_DRAFT_LEGS
      || legs.length === 0
      || legs.some((leg) => !completeLeg(leg))
      || stake === ''
      || (legs.length >= 2 && totalOdds === ''),
  };
}

export function setScannerDraftHandoff(analysis: ScannerAnalysis): void {
  pendingHandoff = scannerAnalysisToTrackerDraft(analysis);
}

export function peekScannerDraftHandoff(): ScannerDraftHandoff | null {
  return pendingHandoff;
}

export function clearScannerDraftHandoff(handoff: ScannerDraftHandoff): void {
  if (pendingHandoff === handoff) pendingHandoff = null;
}
