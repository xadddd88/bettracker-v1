import { utf8ByteLength, type PreparedImage } from './image-policy';

export type ScannerLeg = {
  eventName: string | null;
  marketType: string | null;
  odds: number | null;
  selection: string | null;
  sport: string | null;
};

export type ScannerAnalysis = {
  bookmaker: string | null;
  eventName: string | null;
  legs: ScannerLeg[];
  marketType: string | null;
  selection: string | null;
  sport: string | null;
  stake: number | null;
  totalOdds: number | null;
};

export type ScannerRequestBody = {
  image: string;
  media_type: 'image/jpeg';
};

const MAX_SCANNER_REQUEST_BYTES = 4_400_000;
const MAX_SCANNER_LEGS = 20;

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}
function text(value: unknown, maxLength = 500): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized ? normalized.slice(0, maxLength) : null;
}

function number(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function scannerRequestBody(image: PreparedImage): ScannerRequestBody | null {
  const body: ScannerRequestBody = { image: image.base64, media_type: 'image/jpeg' };
  return utf8ByteLength(JSON.stringify(body)) <= MAX_SCANNER_REQUEST_BYTES ? body : null;
}

export function parseScannerResponse(value: unknown): ScannerAnalysis | null {
  const envelope = record(value);
  const data = record(envelope?.data);
  if (envelope?.success !== true || !data) return null;

  const rawLegs = data.legs;
  if (rawLegs !== undefined && !Array.isArray(rawLegs)) return null;
  if (Array.isArray(rawLegs) && rawLegs.length > MAX_SCANNER_LEGS) return null;

  const legs: ScannerLeg[] = [];
  for (const rawLeg of rawLegs ?? []) {
    const leg = record(rawLeg);
    if (!leg) return null;
    legs.push({
      eventName: text(leg.eventName),
      marketType: text(leg.marketType, 200),
      odds: number(leg.odds),
      selection: text(leg.selection, 300),
      sport: text(leg.sport, 40),
    });
  }

  const analysis: ScannerAnalysis = {
    bookmaker: text(data.bookmaker, 120),
    eventName: text(data.event_name),
    legs,
    marketType: text(data.market_type, 200),
    selection: text(data.selection, 500),
    sport: text(data.sport, 40),
    stake: number(data.stake),
    totalOdds: number(data.odds),
  };

  return analysis.eventName || analysis.legs.length > 0 ? analysis : null;
}
