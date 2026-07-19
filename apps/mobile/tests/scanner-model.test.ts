import assert from 'node:assert/strict';
import test from 'node:test';

import { MAX_ANALYZE_JSON_BYTES, type PreparedImage } from '../src/ai/image-policy';
import { parseScannerResponse, scannerRequestBody } from '../src/ai/scanner-model';

function image(base64: string): PreparedImage {
  return {
    base64,
    bodyBytes: 0,
    contentType: 'image/jpeg',
    height: 1200,
    profile: { compress: 0.7, maxDimension: 1600 },
    uri: 'file:///coupon.jpg',
    width: 900,
  };
}

test('scanner request matches the existing server contract and stays below the local ceiling', () => {
  const body = scannerRequestBody(image('base64-coupon'));

  assert.deepEqual(body, { image: 'base64-coupon', media_type: 'image/jpeg' });
  assert.ok(Buffer.byteLength(JSON.stringify(body), 'utf8') <= MAX_ANALYZE_JSON_BYTES);
});

test('scanner request fails closed when the complete serialized body is oversized', () => {
  assert.equal(scannerRequestBody(image('a'.repeat(MAX_ANALYZE_JSON_BYTES))), null);
});

test('scanner response preserves ordered legs and ignores provider diagnostics', () => {
  const result = parseScannerResponse({
    success: true,
    rawText: 'SHOULD NOT BE READ',
    data: {
      bookmaker: 'Example Sports',
      event_name: 'First event + Second event',
      market_type: 'Express (2 legs)',
      odds: 3.15,
      rawText: 'PRIVATE OCR TEXT',
      selection: 'Home + Over 2.5',
      sport: 'soccer',
      stake: 25,
      legs: [
        { eventName: 'First event', marketType: 'Winner', odds: 1.5, selection: 'Home', sport: 'soccer' },
        { eventName: 'Second event', marketType: 'Total', odds: 2.1, selection: 'Over 2.5', sport: 'soccer' },
      ],
    },
  });

  assert.deepEqual(result, {
    bookmaker: 'Example Sports',
    eventName: 'First event + Second event',
    legs: [
      { eventName: 'First event', marketType: 'Winner', odds: 1.5, selection: 'Home', sport: 'soccer' },
      { eventName: 'Second event', marketType: 'Total', odds: 2.1, selection: 'Over 2.5', sport: 'soccer' },
    ],
    marketType: 'Express (2 legs)',
    selection: 'Home + Over 2.5',
    sport: 'soccer',
    stake: 25,
    totalOdds: 3.15,
  });
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE OCR TEXT|SHOULD NOT BE READ/);
});

test('scanner response fails closed on malformed or excessive leg data', () => {
  assert.equal(parseScannerResponse(null), null);
  assert.equal(parseScannerResponse({ success: false, data: {} }), null);
  assert.equal(parseScannerResponse({ success: true, data: { event_name: null, legs: [] } }), null);
  assert.equal(parseScannerResponse({ success: true, data: { event_name: 'x', legs: {} } }), null);
  assert.equal(parseScannerResponse({
    success: true,
    data: { event_name: 'too many', legs: Array.from({ length: 21 }, () => ({})) },
  }), null);
});

test('scanner response bounds untrusted text before rendering', () => {
  const result = parseScannerResponse({
    success: true,
    data: { event_name: 'x'.repeat(900), legs: [] },
  });

  assert.equal(result?.eventName?.length, 500);
});
