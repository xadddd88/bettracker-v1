export const MAX_DRAFT_LEGS = 20;

export const TRACKER_SPORTS = [
  'soccer',
  'tennis',
  'basketball',
  'ice_hockey',
  'cs2',
  'mma',
  'other',
] as const;

export type TrackerSport = (typeof TRACKER_SPORTS)[number];

export type TrackerLegDraft = {
  eventName: string;
  id: string;
  marketType: string;
  odds: string;
  selection: string;
  sport: TrackerSport;
};

export type TrackerDraft = {
  bookmaker: string;
  legs: TrackerLegDraft[];
  notes: string;
  source: 'manual' | 'scanner';
  stake: string;
  totalOdds: string;
};

export type TrackerDraftPayload = {
  bookmaker: string | null;
  legs: {
    event_name: string;
    market_type: string;
    odds: number;
    selection: string | null;
    sport: TrackerSport;
  }[];
  notes: string | null;
  source: 'manual' | 'scanner';
  stake: number;
  total_odds: number | null;
};

export type DraftIssue = {
  field: string;
  message: string;
};

export type DraftValidation =
  | { issues: []; ok: true; payload: TrackerDraftPayload }
  | { issues: DraftIssue[]; ok: false };

export function emptyTrackerLeg(id: string, sport: TrackerSport = 'soccer'): TrackerLegDraft {
  return {
    eventName: '',
    id,
    marketType: '',
    odds: '',
    selection: '',
    sport,
  };
}

export function emptyTrackerDraft(): TrackerDraft {
  return {
    bookmaker: '',
    legs: [emptyTrackerLeg('leg-1')],
    notes: '',
    source: 'manual',
    stake: '',
    totalOdds: '',
  };
}

export function parseDraftDecimal(value: string): number | null {
  const normalized = value.trim().replace(',', '.');
  if (!/^(?:\d+\.?\d*|\.\d+)$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function computeDraftExpressOdds(legs: TrackerLegDraft[]): number | null {
  if (legs.length < 2) return null;
  let product = 1;

  for (const leg of legs) {
    const odds = parseDraftDecimal(leg.odds);
    if (odds === null || odds <= 1 || odds > 10_000) return null;
    product *= odds;
  }

  return Number.isFinite(product) ? Math.round(product * 1000) / 1000 : null;
}

function requiredText(
  issues: DraftIssue[],
  field: string,
  label: string,
  value: string,
  maxLength: number,
) {
  const trimmed = value.trim();
  if (!trimmed) {
    issues.push({ field, message: `${label} is required.` });
  } else if (trimmed.length > maxLength) {
    issues.push({ field, message: `${label} is too long.` });
  }
}

function optionalText(
  issues: DraftIssue[],
  field: string,
  label: string,
  value: string,
  maxLength: number,
) {
  if (value.trim().length > maxLength) {
    issues.push({ field, message: `${label} is too long.` });
  }
}

export function validateTrackerDraft(draft: TrackerDraft): DraftValidation {
  const issues: DraftIssue[] = [];

  if (draft.legs.length < 1) {
    issues.push({ field: 'legs', message: 'At least one leg is required.' });
  } else if (draft.legs.length > MAX_DRAFT_LEGS) {
    issues.push({ field: 'legs', message: `A bet can have at most ${MAX_DRAFT_LEGS} legs.` });
  }

  const mappedLegs = draft.legs.map((leg, index) => {
    const prefix = `legs.${index}`;
    requiredText(issues, `${prefix}.eventName`, 'Event', leg.eventName, 200);
    requiredText(issues, `${prefix}.marketType`, 'Market', leg.marketType, 100);
    optionalText(issues, `${prefix}.selection`, 'Selection', leg.selection, 200);

    const odds = parseDraftDecimal(leg.odds);
    if (odds === null || odds <= 1 || odds > 10_000) {
      issues.push({ field: `${prefix}.odds`, message: 'Leg odds must be greater than 1 and at most 10,000.' });
    }

    return {
      event_name: leg.eventName.trim(),
      market_type: leg.marketType.trim(),
      odds: odds ?? Number.NaN,
      selection: leg.selection.trim() || null,
      sport: leg.sport,
    };
  });

  const stake = parseDraftDecimal(draft.stake);
  if (stake === null || stake <= 0 || stake > 100_000_000) {
    issues.push({ field: 'stake', message: 'Stake must be greater than 0 and within the limit.' });
  }

  let totalOdds: number | null = null;
  if (draft.legs.length >= 2) {
    totalOdds = parseDraftDecimal(draft.totalOdds);
    if (totalOdds === null || totalOdds <= 1 || totalOdds > 100_000_000) {
      issues.push({ field: 'totalOdds', message: 'Total odds are required for Express and must be greater than 1.' });
    }
  }

  optionalText(issues, 'bookmaker', 'Bookmaker', draft.bookmaker, 100);
  optionalText(issues, 'notes', 'Notes', draft.notes, 500);

  if (issues.length > 0 || stake === null) {
    return { issues, ok: false };
  }

  return {
    issues: [],
    ok: true,
    payload: {
      bookmaker: draft.bookmaker.trim() || null,
      legs: mappedLegs,
      notes: draft.notes.trim() || null,
      source: draft.source,
      stake,
      total_odds: totalOdds,
    },
  };
}
