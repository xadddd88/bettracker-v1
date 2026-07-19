import assert from 'node:assert/strict';
import test from 'node:test';

import {
  cleanupUnretainedGeneratedImages,
  PreparedImageCacheLifecycle,
} from '../src/ai/image-cache-lifecycle';

test('successful replacement releases only the previously retained JPEG', () => {
  const deleted: string[] = [];
  const lifecycle = new PreparedImageCacheLifecycle((uri) => deleted.push(uri));

  lifecycle.replace('file:///cache/first.jpg');
  lifecycle.replace('file:///cache/second.jpg');

  assert.deepEqual(deleted, ['file:///cache/first.jpg']);
});

test('failed or cancelled replacement preserves the currently retained JPEG', () => {
  const deleted: string[] = [];
  const lifecycle = new PreparedImageCacheLifecycle((uri) => deleted.push(uri));

  lifecycle.replace('file:///cache/current.jpg');
  // A non-ready capture outcome never calls replace.

  assert.deepEqual(deleted, []);
  lifecycle.clear();
  assert.deepEqual(deleted, ['file:///cache/current.jpg']);
});

test('Remove, successful Analyze and unmount share idempotent clear behavior', () => {
  const deleted: string[] = [];
  const lifecycle = new PreparedImageCacheLifecycle((uri) => deleted.push(uri));

  for (const uri of ['remove.jpg', 'analyze.jpg', 'unmount.jpg']) {
    lifecycle.replace(`file:///cache/${uri}`);
    lifecycle.clear();
    lifecycle.clear();
  }

  assert.deepEqual(deleted, [
    'file:///cache/remove.jpg',
    'file:///cache/analyze.jpg',
    'file:///cache/unmount.jpg',
  ]);
});

test('intermediate and rejected profile outputs are deleted while the selected JPEG is retained', () => {
  const deleted: string[] = [];
  cleanupUnretainedGeneratedImages(
    ['file:///cache/large.jpg', 'file:///cache/final.jpg', 'file:///cache/large.jpg'],
    'file:///cache/final.jpg',
    (uri) => deleted.push(uri),
  );

  assert.deepEqual(deleted, ['file:///cache/large.jpg']);
});
