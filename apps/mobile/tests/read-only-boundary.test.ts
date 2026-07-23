import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    return statSync(path).isDirectory() ? sourceFiles(path) : /\.(ts|tsx)$/.test(path) ? [path] : [];
  });
}

test('Mobile client has one approved tracked-bet route seam and no direct financial writes or privileged secrets', () => {
  const paths = sourceFiles(join(process.cwd(), 'src'));
  const sources = paths.map((path) => ({ path, source: readFileSync(path, 'utf8') }));
  const source = sources.map(({ source: contents }) => contents).join('\n');

  for (const forbidden of [
    /\.insert\s*\(/,
    /\.update\s*\(/,
    /\.upsert\s*\(/,
    /\.rpc\s*\(/,
    /service[_-]?role/i,
    /SUPABASE_SERVICE/i,
    /ANTHROPIC_API_KEY/,
  ]) {
    assert.doesNotMatch(source, forbidden);
  }

  const deleteCallers = sources.filter(({ source: contents }) => /\.delete\s*\(/.test(contents));
  assert.deepEqual(
    deleteCallers.map(({ path }) => path),
    [join(process.cwd(), 'src/ai/image-cache.ts')],
    'only the local generated-image cache cleaner may delete a file',
  );
  assert.match(deleteCallers[0].source, /new File\(uri\)/);
  assert.match(deleteCallers[0].source, /Paths\.cache\.uri/);

  const scannerCallers = sources.filter(({ source: contents }) => /\/api\/ai\/scanner/.test(contents));
  assert.deepEqual(
    scannerCallers.map(({ path }) => path),
    [join(process.cwd(), 'src/ai/scanner-client.ts')],
    'only the audited scanner client may name the scanner API route',
  );
  assert.equal(
    scannerCallers[0].source.match(/\/api\/ai\/scanner/g)?.length,
    1,
    'the approved scanner route must appear exactly once',
  );

  const trackedBetCallers = sources.filter(({ source: contents }) => /\/api\/bets\/tracked/.test(contents));
  assert.deepEqual(
    trackedBetCallers.map(({ path }) => path),
    [join(process.cwd(), 'src/bets/save.ts')],
    'only the audited tracked-bet client may name the financial API route',
  );
  assert.equal(
    trackedBetCallers[0].source.match(/\/api\/bets\/tracked/g)?.length,
    1,
    'the approved tracked-bet route must appear exactly once',
  );
  assert.match(trackedBetCallers[0].source, /authenticatedJsonRequest<SavedBetResponse>/);
  assert.match(trackedBetCallers[0].source, /idempotency_key: idempotencyKey/);
});

test('read model uses explicit columns and orders nested legs', () => {
  const source = readFileSync(join(process.cwd(), 'src/bets/data.ts'), 'utf8');
  assert.doesNotMatch(source, /select\s*\(\s*['"`]\s*\*/);
  assert.match(source, /leg_index/);
  assert.match(source, /referencedTable:\s*'bet_legs'/);
  assert.match(source, /\.eq\('user_id',\s*userId\)/);
});
