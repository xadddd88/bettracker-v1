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

// Content checks retry up to 3 times (5 s apart) to tolerate SSR warm-up
// on fresh Vercel preview deployments. All 3 attempts failing = real failure.
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
    const redirect = res.url !== url ? ` → ${res.url}` : '';
    console.log(`${ok ? '✅' : '❌'} ${res.status} ${path}${redirect}`);
    if (!ok) failed++;
  } catch (err) {
    console.log(`❌ ERR ${path} — ${err.message}`);
    failed++;
  }
}

for (const { path, contains } of CONTENT_CHECKS) {
  const url = BASE_URL + path;
  let found = false;
  let lastBody = '';
  let lastFinalUrl = url;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, { redirect: 'follow' });
      lastFinalUrl = res.url;
      lastBody = await res.text();
      if (lastBody.includes(contains)) {
        found = true;
        break;
      }
    } catch (err) {
      console.log(`  [${attempt}/3] ERR ${path} — ${err.message}`);
    }
    if (!found && attempt < 3) {
      console.log(`  [${attempt}/3] "${contains}" not in ${path} — retrying in 5s`);
      await new Promise(r => setTimeout(r, 5000));
    }
  }

  if (found) {
    console.log(`✅ content "${contains}" in ${path}`);
  } else {
    console.log(`❌ content "${contains}" in ${path}`);
    console.log(`   final URL : ${lastFinalUrl}`);
    console.log(`   body[0:300]: ${lastBody.slice(0, 300).replace(/\n/g, ' ')}`);
    failed++;
  }
}

console.log(`\n${failed === 0 ? '✅ All checks passed' : `❌ ${failed} check(s) failed`}`);
process.exit(failed > 0 ? 1 : 0);
