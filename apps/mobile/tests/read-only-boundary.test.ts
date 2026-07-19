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

test('Mobile client contains no financial writes, privileged secrets or unapproved Next APIs', () => {
  const paths = sourceFiles(join(process.cwd(), 'src'));
  const sources = paths.map((path) => ({ path, source: readFileSync(path, 'utf8') }));
  const source = sources.map(({ source: contents }) => contents).join('\n');

  for (const forbidden of [
    /\.insert\s*\(/,
    /\.update\s*\(/,
    /\.upsert\s*\(/,
    /\.delete\s*\(/,
    /\.rpc\s*\(/,
    /service[_-]?role/i,
    /SUPABASE_SERVICE/i,
    /ANTHROPIC_API_KEY/,
    /\/api\/bets/,
  ]) {
    assert.doesNotMatch(source, forbidden);
  }

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
});

test('read model uses explicit columns and orders nested legs', () => {
  const source = readFileSync(join(process.cwd(), 'src/bets/data.ts'), 'utf8');
  assert.doesNotMatch(source, /select\s*\(\s*['"`]\s*\*/);
  assert.match(source, /leg_index/);
  assert.match(source, /referencedTable:\s*'bet_legs'/);
  assert.match(source, /\.eq\('user_id',\s*userId\)/);
});
