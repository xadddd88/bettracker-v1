import assert from 'node:assert/strict';
import test from 'node:test';

import {
  analysisBodyByteLength,
  JPEG_PROFILES,
  MAX_ANALYZE_JSON_BYTES,
  prepareWithProfiles,
  resizeWithin,
  utf8ByteLength,
  type RenderedJpeg,
} from '../src/ai/image-policy';

test('measures the complete prospective JSON body in UTF-8 bytes', () => {
  const expected = JSON.stringify({
    mode: 'coupon',
    image: {
      contentType: 'image/jpeg',
      base64: 'YWJj',
    },
  });

  assert.equal(analysisBodyByteLength('coupon', 'YWJj'), utf8ByteLength(expected));
  assert.equal(utf8ByteLength('\u20b4'), 3);
});

test('defines a strict local body ceiling below the 4.5 MB transport ceiling', () => {
  const emptyBodyBytes = analysisBodyByteLength('coupon', '');
  const exactLimitBase64 = 'A'.repeat(MAX_ANALYZE_JSON_BYTES - emptyBodyBytes);

  assert.ok(MAX_ANALYZE_JSON_BYTES < 4_500_000);
  assert.equal(
    analysisBodyByteLength('coupon', exactLimitBase64),
    MAX_ANALYZE_JSON_BYTES,
  );
});

test('rejects a prepared body at the exact 4,400,000-byte boundary', async () => {
  const emptyBodyBytes = analysisBodyByteLength('coupon', '');
  const exactLimitBase64 = 'A'.repeat(MAX_ANALYZE_JSON_BYTES - emptyBodyBytes);
  const result = await prepareWithProfiles('coupon', async () => rendered(exactLimitBase64));

  assert.deepEqual(result, { status: 'oversize' });
});

test('resizes the longest side without upscaling', () => {
  assert.deepEqual(resizeWithin(4000, 2000, 2048), { width: 2048 });
  assert.deepEqual(resizeWithin(1200, 3000, 1600), { height: 1600 });
  assert.equal(resizeWithin(800, 600, 2048), null);
});

test('uses the approved four JPEG profiles in descending fidelity', () => {
  assert.deepEqual(JPEG_PROFILES, [
    { maxDimension: 2048, compress: 0.82 },
    { maxDimension: 1600, compress: 0.7 },
    { maxDimension: 1280, compress: 0.58 },
    { maxDimension: 1024, compress: 0.48 },
  ]);
});

test('accepts the first profile whose complete body fits the local limit', async () => {
  const attemptedDimensions: number[] = [];
  const oversized = 'A'.repeat(MAX_ANALYZE_JSON_BYTES);

  const result = await prepareWithProfiles('event', async (profile) => {
    attemptedDimensions.push(profile.maxDimension);
    return rendered(profile.maxDimension === 2048 ? oversized : 'c21hbGw=');
  });

  assert.equal(result.status, 'ready');
  if (result.status !== 'ready') return;

  assert.deepEqual(attemptedDimensions, [2048, 1600]);
  assert.equal(result.image.profile.maxDimension, 1600);
  assert.equal(result.image.contentType, 'image/jpeg');
  assert.ok(result.image.bodyBytes < MAX_ANALYZE_JSON_BYTES);
});

test('fails closed after every approved profile remains oversized', async () => {
  let attempts = 0;
  const oversized = 'A'.repeat(MAX_ANALYZE_JSON_BYTES);

  const result = await prepareWithProfiles('coupon', async () => {
    attempts += 1;
    return rendered(oversized);
  });

  assert.deepEqual(result, { status: 'oversize' });
  assert.equal(attempts, JPEG_PROFILES.length);
});

test('treats missing JPEG data and renderer failure as corrupt input', async () => {
  const emptyResult = await prepareWithProfiles('coupon', async () => rendered(''));
  const thrownResult = await prepareWithProfiles('coupon', async () => {
    throw new Error('RAW_NATIVE_ERROR');
  });

  assert.deepEqual(emptyResult, { status: 'corrupt' });
  assert.deepEqual(thrownResult, { status: 'corrupt' });
  assert.doesNotMatch(JSON.stringify(thrownResult), /RAW_NATIVE_ERROR/);
});

function rendered(base64: string): RenderedJpeg {
  return {
    base64,
    height: 900,
    uri: 'file:///prepared.jpg',
    width: 1200,
  };
}
