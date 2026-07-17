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

test('Mobile Phase 0 contains no financial writes, RPCs, Next APIs or privileged secrets', () => {
  const source = sourceFiles(join(process.cwd(), 'src'))
    .map((path) => readFileSync(path, 'utf8'))
    .join('\n');

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
    /\/api\/ai\/scanner/,
  ]) {
    assert.doesNotMatch(source, forbidden);
  }
});

test('read model uses explicit columns and orders nested legs', () => {
  const source = readFileSync(join(process.cwd(), 'src/bets/data.ts'), 'utf8');
  assert.doesNotMatch(source, /select\s*\(\s*['"`]\s*\*/);
  assert.match(source, /leg_index/);
  assert.match(source, /referencedTable:\s*'bet_legs'/);
  assert.match(source, /\.eq\('user_id',\s*userId\)/);
});
