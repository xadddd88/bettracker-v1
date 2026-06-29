#!/usr/bin/env node
// Smoke-tests a deployed URL. Usage: node scripts/smoke-test.mjs <baseUrl>

const BASE_URL = process.argv[2]?.replace(/\/$/, '');
if (!BASE_URL) {
  console.error('Usage: node scripts/smoke-test.mjs <baseUrl>');
  process.exit(1);
}

const ROUTES = [
  { path: '/',          expect: 200 },
  { path: '/login',     expect: 200 },
  { path: '/dashboard', expect: 200 },
  { path: '/bets',      expect: 200 },
  { path: '/bankroll',  expect: 200 },
  { path: '/settings',  expect: 200 },
  { path: '/analytics', expect: 200 },
];

const CONTENT_CHECKS = [
  { path: '/login', contains: 'BetTracker' },
];

console.log(`\nSmoke testing: ${BASE_URL}\n`);

let failed = 0;

for (const { path, expect: expectedStatus } of ROUTES) {
  const url = BASE_URL + path;
  try {
    const res = await fetch(url, { redirect: 'follow' });
    const ok = res.status === expectedStatus;
    console.log(`${ok ? '✅' : '❌'} ${res.status} ${path}`);
    if (!ok) failed++;
  } catch (err) {
    console.log(`❌ ERR ${path} — ${err.message}`);
    failed++;
  }
}

for (const { path, contains } of CONTENT_CHECKS) {
  const url = BASE_URL + path;
  try {
    const res = await fetch(url, { redirect: 'follow' });
    const body = await res.text();
    const ok = body.includes(contains);
    console.log(`${ok ? '✅' : '❌'} content "${contains}" in ${path}`);
    if (!ok) failed++;
  } catch (err) {
    console.log(`❌ ERR content check ${path} — ${err.message}`);
    failed++;
  }
}

console.log(`\n${failed === 0 ? '✅ All checks passed' : `❌ ${failed} check(s) failed`}`);
process.exit(failed > 0 ? 1 : 0);
