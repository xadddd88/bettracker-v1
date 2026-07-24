#!/usr/bin/env node

import assert from 'node:assert/strict';
import { AsyncLocalStorage } from 'node:async_hooks';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import tls from 'node:tls';
import Module, { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const repoRoot = path.resolve(__dirname, '..');
const buildDir = path.join(repoRoot, 'build', 'provider-smoke');
const fixtureRoot = path.join(repoRoot, 'docs', 'ai-baseline', 'fixtures', 'v1');
const runtimeCommit = '83e92616e2a485b351c41317e4034394bf0eee0b';
const asyncContext = new AsyncLocalStorage();
const onePixelPng =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

const fixtureFiles = ['scanner', 'analyst', 'scout', 'coach'];
const datasets = Object.fromEntries(
  fixtureFiles.map(flow => [
    flow,
    JSON.parse(readFileSync(path.join(fixtureRoot, `${flow}.json`), 'utf8')),
  ]),
);
const contracts = JSON.parse(readFileSync(path.join(fixtureRoot, 'contracts.json'), 'utf8'));
const priceCardPath = path.join(
  repoRoot,
  'docs',
  'ai-baseline',
  'price-cards',
  'anthropic-sonnet-4-6-2026-07-24.json',
);
const priceCard = JSON.parse(readFileSync(priceCardPath, 'utf8'));

let passedAssertions = 0;
let failedAssertions = 0;
const assertionFailures = [];

function check(condition, message) {
  try {
    assert.ok(condition, message);
    passedAssertions += 1;
  } catch (error) {
    failedAssertions += 1;
    assertionFailures.push(error.message);
  }
}

function checkEqual(actual, expected, message) {
  try {
    assert.deepEqual(actual, expected, message);
    passedAssertions += 1;
  } catch (error) {
    failedAssertions += 1;
    assertionFailures.push(`${message}: ${error.message}`);
  }
}

function git(...args) {
  return execFileSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function validateDataset() {
  const ids = new Set();
  for (const flow of fixtureFiles) {
    const dataset = datasets[flow];
    checkEqual(dataset.schema_version, 1, `${flow}: schema_version`);
    checkEqual(dataset.dataset_version, 'ai-baseline-v1', `${flow}: dataset_version`);
    checkEqual(dataset.flow, flow, `${flow}: flow`);
    check(Array.isArray(dataset.fixtures) && dataset.fixtures.length > 0, `${flow}: fixtures are required`);
    const classes = new Set();
    for (const fixture of dataset.fixtures) {
      check(typeof fixture.id === 'string' && fixture.id.length > 0, `${flow}: fixture id`);
      check(!ids.has(fixture.id), `${flow}: fixture id must be unique: ${fixture.id}`);
      ids.add(fixture.id);
      classes.add(fixture.class);
      check(typeof fixture.sport === 'string', `${fixture.id}: sport`);
      check(typeof fixture.language === 'string', `${fixture.id}: language`);
      check(typeof fixture.mock_output_template === 'string', `${fixture.id}: mock_output_template`);
      check(typeof fixture.expected === 'object' && fixture.expected !== null, `${fixture.id}: expected`);
      for (const field of ['status', 'provider_attempts', 'persistence_attempts', 'schema_valid']) {
        check(Object.hasOwn(fixture.expected, field), `${fixture.id}: expected.${field}`);
      }
    }
    checkEqual([...classes].sort(), ['boundary', 'error', 'success'], `${flow}: success/error/boundary coverage`);
  }

  const explicitLocales = ['ar', 'auto', 'de', 'en', 'es', 'fr', 'ru', 'uk'];
  for (const flow of ['analyst', 'scout']) {
    const observed = [...new Set(datasets[flow].fixtures
      .filter(fixture => fixture.class === 'success')
      .map(fixture => fixture.language))].sort();
    checkEqual(observed, explicitLocales, `${flow}: every explicit route locale has a success fixture`);
  }
  const coachLocales = [...new Set(datasets.coach.fixtures
    .filter(fixture => fixture.class === 'success')
    .map(fixture => fixture.language))].sort();
  checkEqual(coachLocales, ['ar', 'de', 'en', 'es', 'fr', 'ru', 'uk'], 'coach: representative product locales');
}

function staticContractAudit() {
  const scanner = readFileSync(path.join(repoRoot, 'app', 'api', 'ai', 'scanner', 'route.ts'), 'utf8');
  const analyst = readFileSync(path.join(repoRoot, 'app', 'api', 'ai', 'analyst', 'route.ts'), 'utf8');
  const scout = readFileSync(path.join(repoRoot, 'app', 'api', 'scout', 'route.ts'), 'utf8');
  const coach = readFileSync(path.join(repoRoot, 'app', 'api', 'coach', 'route.ts'), 'utf8');
  const research = readFileSync(path.join(repoRoot, 'lib', 'ai', 'analyst-research.ts'), 'utf8');

  const assertions = [
    [scanner.includes("model: 'claude-sonnet-4-6'"), 'scanner hard-coded model'],
    [/max_tokens:\s*1200/.test(scanner), 'scanner max_tokens=1200'],
    [/SCANNER_UPSTREAM_TIMEOUT_MS[\s\S]*60_000/.test(scanner), 'scanner 60s default timeout'],
    [/shouldRetryScannerParse[\s\S]*missingFields\.includes\('legs'\)/.test(scanner), 'scanner missing-legs retry only'],
    [/max_tokens:\s*5_000/.test(analyst), 'analyst max_tokens=5000'],
    [/ANALYST_TIMEOUT_MS\s*=\s*60_000/.test(analyst), 'analyst 60s turn timeout'],
    [/maxContinuations\s*=\s*2/.test(research), 'analyst at most two pause_turn continuations'],
    [/persist_analysis_decision/.test(analyst), 'analyst persistence RPC'],
    [/TIMEOUT_WITH_WEB_SEARCH_MS\s*=\s*55_000/.test(scout), 'scout web timeout=55s'],
    [/TIMEOUT_WITHOUT_WEB_SEARCH_MS\s*=\s*55_000/.test(scout), 'scout non-web timeout=55s'],
    [/fallback without web search/.test(scout), 'scout web-search fallback'],
    [/persist_market_opportunities/.test(scout), 'scout persistence RPC'],
    [/max_tokens:\s*2000/.test(coach), 'coach max_tokens=2000'],
    [!/AbortController|AbortSignal\.timeout|APIConnectionTimeout/.test(coach), 'coach has no explicit provider timeout'],
    [/persist_coaching_session/.test(coach), 'coach persistence RPC'],
  ];
  for (const [condition, message] of assertions) check(condition, message);

  const runtimeDiff = git(
    'diff',
    '--name-only',
    runtimeCommit,
    '--',
    'app',
    'lib',
    'apps/mobile/src',
    'supabase/migrations',
    'vercel.json',
    'next.config.ts',
  ).split(/\r?\n/).filter(Boolean);
  checkEqual(runtimeDiff, [], 'baseline branch changes no runtime, mobile, or migration files');
  checkEqual(git('rev-parse', `${runtimeCommit}^{commit}`), runtimeCommit, 'runtime commit exists');
  checkEqual(contracts.runtime_commit, runtimeCommit, 'contract pins exact runtime commit');

  return {
    runtime_files_changed: runtimeDiff,
    evidence: {
      scanner: 'app/api/ai/scanner/route.ts',
      analyst: 'app/api/ai/analyst/route.ts',
      analyst_continuation: 'lib/ai/analyst-research.ts',
      scout: 'app/api/scout/route.ts',
      coach: 'app/api/coach/route.ts',
      rate_limits: 'lib/rate-limit.ts',
    },
  };
}

function changedDocumentationLinkAudit() {
  const documents = [
    path.join(repoRoot, 'docs', 'ai-baseline', 'README.md'),
    path.join(repoRoot, 'docs', 'ai-baseline', 'protocol.md'),
  ];
  const checked = [];
  for (const document of documents) {
    const markdown = readFileSync(document, 'utf8');
    const links = markdown.matchAll(/\[[^\]]+\]\((<)?([^)>]+)(?:>)?\)/g);
    for (const match of links) {
      const target = match[2];
      if (/^(?:https?:|mailto:|#)/.test(target)) continue;
      const withoutAnchor = target.split('#', 1)[0];
      const resolved = path.resolve(path.dirname(document), decodeURIComponent(withoutAnchor));
      check(existsSync(resolved), `${path.relative(repoRoot, document)}: link target exists: ${target}`);
      checked.push({
        document: path.relative(repoRoot, document).replaceAll('\\', '/'),
        target,
      });
    }
  }
  return checked;
}

class FakeBadRequestError extends Error {}
class FakeRateLimitError extends Error {}
class FakeTimeoutError extends Error {}
class FakeConnectionError extends Error {}
class FakeAuthenticationError extends Error {}
class FakeApiError extends Error {
  constructor(message = 'fake_api_error', status = 500) {
    super(message);
    this.status = status;
  }
}
class FakeInternalServerError extends FakeApiError {}

const languageMarkers = {
  auto: 'BASELINE_AUTO_EN',
  uk: 'БАЗОВИЙ_UK',
  ru: 'БАЗОВЫЙ_RU',
  en: 'BASELINE_EN',
  es: 'BASE_ES',
  fr: 'BASE_FR',
  de: 'BASIS_DE',
  ar: 'أساس_AR',
};

function analystOutput(fixture, cited = false) {
  const marker = languageMarkers[fixture.language] ?? 'BASELINE_EN';
  const output = {
    model_probability: null,
    implied_probability: null,
    edge_percent: null,
    confidence_score: 45,
    risk_level: 'high',
    recommendation: 'watch',
    reasoning: `${marker}: synthetic route-contract reasoning with no live-model quality claim.`,
    factors: [
      { name: `${marker} form`, score: 0, detail: 'Synthetic factor for schema coverage only.' },
      { name: `${marker} availability`, score: -1, detail: 'Synthetic factor for schema coverage only.' },
      { name: `${marker} market`, score: 0, detail: 'Synthetic factor for schema coverage only.' },
      { name: `${marker} variance`, score: -1, detail: 'Synthetic factor for schema coverage only.' },
    ],
    disclaimer: `${marker}: synthetic output; not betting advice and not a live-model evaluation.`,
  };
  if (cited) {
    const claim = 'Synthetic source states that the fixture is scheduled.';
    output.research_brief = {
      headline: `${marker} synthetic cited research`,
      summary: `${marker} route-level citation binding is exercised with a synthetic source record.`,
      builder_risk: null,
      verdict: 'Verify every current fact before any real decision.',
      data_gaps: ['Real provider grounding is not measured'],
      sourced_claims: [{
        claim,
        source_url: 'https://baseline.example.com/research',
      }],
      legs: [{
        leg_number: 1,
        event_name: fixture.input.event_name,
        market_type: fixture.input.market_type,
        selection: fixture.input.selection ?? null,
        assessment: 'Synthetic assessment used only to exercise route validation.',
        evidence: [claim],
        risks: ['No live provider was called'],
        fixture_status: 'scheduled',
        coverage: {
          live_injuries: false,
          team_news: false,
          recent_form: false,
          line_movement: false,
        },
      }],
    };
  }
  return output;
}

function scoutOutput(fixture) {
  const marker = languageMarkers[fixture.language] ?? 'BASELINE_EN';
  return {
    candidates: [{
      event_name: 'Synthetic North - Synthetic South',
      market_type: 'Synthetic review market',
      selection: 'Synthetic North',
      match_date: null,
      offered_odds: null,
      opportunity_type: 'general',
      scout_score: 40,
      model_probability: 50,
      implied_probability: null,
      edge_percent: null,
      confidence_score: 35,
      risk_level: 'high',
      reasoning: `${marker}: synthetic candidate for route-contract verification only.`,
      required_checks: ['Verify fixture identity', 'Verify all current market data'],
    }],
    disclaimer: `${marker}: synthetic fixture; no current facts or pricing were verified.`,
  };
}

function coachOutput(fixture) {
  const marker = languageMarkers[fixture.language] ?? 'BASELINE_EN';
  return {
    summary: `${marker}: synthetic retrospective summary for route-contract verification only.`,
    calibration_grade: null,
    strengths: [`${marker}: synthetic record-keeping strength.`],
    weaknesses: [`${marker}: sample remains synthetic and cannot establish betting skill.`],
    recommendations: [{
      priority: 'high',
      action: `${marker}: keep a consistent review log`,
      detail: 'Use a fixed retrospective checklist and do not infer future outcomes from this synthetic sample.',
    }],
    patterns: { baseline: marker },
    disclaimer: `${marker}: past performance does not predict future results; this is synthetic.`,
  };
}

function scannerOutput(template) {
  if (template === 'scanner_tennis_en') {
    return {
      rawText: 'Today, 18:30\nPlayer Alpha - Player Beta\nMatch winner\nPlayer Alpha\n1.90',
      couponType: 'single',
      totalOdds: 1.9,
      eventStartText: 'Today, 18:30',
      legs: [{
        rawText: 'Player Alpha - Player Beta\nMatch winner\nPlayer Alpha\n1.90',
        eventName: 'Player Alpha - Player Beta',
        marketType: 'Match winner',
        selection: 'Player Alpha',
        odds: 1.9,
        sport: 'tennis',
        isLive: false,
        statusSource: 'unknown',
      }],
    };
  }
  return {
    rawText: 'Сьогодні, 20:00\nДніпро - Полісся\nРезультат матчу\nДніпро\n2.10',
    couponType: 'single',
    totalOdds: 2.1,
    eventStartText: 'Сьогодні, 20:00',
    legs: [{
      rawText: 'Дніпро - Полісся\nРезультат матчу\nДніпро\n2.10',
      eventName: 'Дніпро - Полісся',
      marketType: 'Результат матчу',
      selection: 'Дніпро',
      odds: 2.1,
      sport: 'soccer',
      isLive: false,
      statusSource: 'unknown',
    }],
  };
}

function messageFromOutput(output, citations = false) {
  const block = { type: 'text', text: JSON.stringify(output) };
  if (citations) {
    block.citations = [{
      type: 'web_search_result_location',
      url: 'https://baseline.example.com/research',
      title: 'Synthetic baseline source',
      cited_text: 'Synthetic source states that the fixture is scheduled.',
    }];
  }
  return {
    id: 'msg_offline_baseline',
    type: 'message',
    role: 'assistant',
    model: 'claude-sonnet-4-6',
    content: [block],
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: { input_tokens: 0, output_tokens: 0 },
  };
}

function faultForContext(context) {
  if (context.fault === 'timeout') {
    const error = new Error('synthetic timeout');
    error.name = 'AbortError';
    return error;
  }
  if (context.fault === 'rate_limit') return new FakeRateLimitError('synthetic 429');
  if (context.fault === 'server_error') return new FakeInternalServerError('synthetic 529', 529);
  return null;
}

async function fakeSdkCreate(params) {
  const context = asyncContext.getStore();
  assert.ok(context, 'provider call escaped the baseline async context');
  context.provider_attempts += 1;
  networkEvidence.fake_anthropic_transports += 1;
  const requestBytes = Buffer.byteLength(JSON.stringify(params));
  const attempt = {
    request_bytes: requestBytes,
    response_bytes: 0,
    model: params.model ?? null,
    max_tokens: params.max_tokens ?? null,
    used_web_search_tool: Array.isArray(params.tools) && params.tools.length > 0,
  };
  context.provider_records.push(attempt);
  if (context.delay_ms > 0) {
    await new Promise(resolve => setTimeout(resolve, context.delay_ms));
  }

  if (
    context.fixture.mock_output_template === 'scout_web_error_then_valid' &&
    context.provider_attempts === 1
  ) {
    throw new FakeInternalServerError('synthetic web-search overload', 529);
  }
  const fault = faultForContext(context);
  if (fault) throw fault;

  if (context.fixture.mock_output_template === 'malformed' || context.fault === 'malformed') {
    const response = messageFromOutput('not-json');
    response.content[0].text = 'not-json';
    attempt.response_bytes = Buffer.byteLength('not-json');
    return response;
  }

  if (
    context.fixture.mock_output_template === 'analyst_pause_then_valid' &&
    context.provider_attempts === 1
  ) {
    const response = {
      ...messageFromOutput('pause'),
      content: [{ type: 'text', text: 'Synthetic server-tool pause.' }],
      stop_reason: 'pause_turn',
    };
    attempt.response_bytes = Buffer.byteLength(response.content[0].text);
    return response;
  }
  if (
    context.fixture.mock_output_template === 'analyst_two_pauses_then_valid' &&
    context.provider_attempts <= 2
  ) {
    const response = {
      ...messageFromOutput('pause'),
      content: [{ type: 'text', text: `Synthetic server-tool pause ${context.provider_attempts}.` }],
      stop_reason: 'pause_turn',
    };
    attempt.response_bytes = Buffer.byteLength(response.content[0].text);
    return response;
  }
  if (context.fixture.mock_output_template === 'analyst_pause_over_limit') {
    const response = {
      ...messageFromOutput('pause'),
      content: [{ type: 'text', text: `Synthetic over-limit pause ${context.provider_attempts}.` }],
      stop_reason: 'pause_turn',
    };
    attempt.response_bytes = Buffer.byteLength(response.content[0].text);
    return response;
  }

  let output;
  let cited = false;
  if (context.flow === 'analyst') {
    cited = context.fixture.mock_output_template === 'analyst_cited_research';
    output = analystOutput(context.fixture, cited);
  } else if (context.flow === 'scout') {
    output = scoutOutput(context.fixture);
  } else if (context.flow === 'coach') {
    output = coachOutput(context.fixture);
  } else {
    throw new Error(`SDK provider called for unsupported flow ${context.flow}`);
  }
  const response = messageFromOutput(output, cited);
  attempt.response_bytes = Buffer.byteLength(response.content[0].text);
  return response;
}

class FakeAnthropic {
  static BadRequestError = FakeBadRequestError;
  static RateLimitError = FakeRateLimitError;
  static APIConnectionTimeoutError = FakeTimeoutError;
  static APIConnectionError = FakeConnectionError;
  static AuthenticationError = FakeAuthenticationError;
  static APIError = FakeApiError;
  static InternalServerError = FakeInternalServerError;

  constructor() {
    this.messages = { create: fakeSdkCreate };
  }
}

function scannerHttpResponse(status, payload) {
  const text = typeof payload === 'string' ? payload : JSON.stringify(payload);
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() { return text; },
    async json() { return typeof payload === 'string' ? JSON.parse(payload) : payload; },
  };
}

async function fakeFetch(url, options = {}) {
  const context = asyncContext.getStore();
  if (!context || context.flow !== 'scanner' || url !== 'https://api.anthropic.com/v1/messages') {
    networkEvidence.blocked_real_outbound_attempts += 1;
    throw new Error('real network is forbidden by the AI baseline harness');
  }
  context.provider_attempts += 1;
  networkEvidence.fake_anthropic_transports += 1;
  const body = JSON.parse(options.body);
  const attempt = {
    request_bytes: Buffer.byteLength(options.body),
    response_bytes: 0,
    model: body.model ?? null,
    max_tokens: body.max_tokens ?? null,
    used_web_search_tool: false,
  };
  context.provider_records.push(attempt);
  if (context.delay_ms > 0) {
    await new Promise(resolve => setTimeout(resolve, context.delay_ms));
  }
  if (context.fault === 'timeout') {
    const error = new Error('synthetic timeout');
    error.name = 'TimeoutError';
    throw error;
  }
  if (context.fault === 'rate_limit') return scannerHttpResponse(429, 'synthetic provider 429');
  if (context.fault === 'server_error') return scannerHttpResponse(529, 'synthetic provider 529');

  let raw;
  if (context.fixture.mock_output_template === 'malformed' || context.fault === 'malformed') {
    raw = 'not-json';
  } else if (
    context.fixture.mock_output_template === 'scanner_missing_legs_then_valid' &&
    context.provider_attempts === 1
  ) {
    raw = JSON.stringify({ couponType: 'express', totalOdds: 2.1 });
  } else {
    raw = JSON.stringify(scannerOutput(context.fixture.mock_output_template));
  }
  attempt.response_bytes = Buffer.byteLength(raw);
  return scannerHttpResponse(200, { content: [{ type: 'text', text: raw }] });
}

const paths = {
  scannerRoute: path.join(buildDir, 'app', 'api', 'ai', 'scanner', 'route.js'),
  analystRoute: path.join(buildDir, 'app', 'api', 'ai', 'analyst', 'route.js'),
  scoutRoute: path.join(buildDir, 'app', 'api', 'scout', 'route.js'),
  coachRoute: path.join(buildDir, 'app', 'api', 'coach', 'route.js'),
  requestAuth: path.join(buildDir, 'lib', 'supabase', 'request-auth.js'),
  supabaseServer: path.join(buildDir, 'lib', 'supabase', 'server.js'),
  supabaseAdmin: path.join(buildDir, 'lib', 'supabase', 'admin.js'),
  analytics: path.join(buildDir, 'lib', 'analytics', 'server.js'),
  rateLimit: path.join(buildDir, 'lib', 'rate-limit.js'),
};

function syntheticHistory(sufficient) {
  const count = sufficient ? 8 : 2;
  return Array.from({ length: count }, (_, index) => ({
    id: `synthetic-bet-${index + 1}`,
    bet_type: 'single',
    stake: 10,
    total_odds: 1.9,
    status: index % 2 === 0 ? 'won' : 'lost',
    pnl: index % 2 === 0 ? 9 : -10,
    source: 'manual',
    placed_at: `2026-07-${String(index + 1).padStart(2, '0')}T12:00:00.000Z`,
    settled_at: `2026-07-${String(index + 1).padStart(2, '0')}T14:00:00.000Z`,
    legs: [{
      sport: index % 2 === 0 ? 'soccer' : 'tennis',
      market_type: 'synthetic market',
      decisions: { confidence_score: null, edge_percent: null },
    }],
  }));
}

function queryBuilder(table, context) {
  const builder = {
    select() { return builder; },
    eq() { return builder; },
    is() { return builder; },
    order() { return builder; },
    gte() { return builder; },
    async single() {
      return {
        data: { web_search_enabled: Boolean(context.web_search) },
        error: null,
      };
    },
    then(resolve, reject) {
      let result;
      if (table === 'bets') {
        result = {
          data: syntheticHistory(context.fixture.history_fixture !== 'synthetic-insufficient-history'),
          error: null,
        };
      } else if (table === 'decisions') {
        result = { data: null, count: 4, error: null };
      } else if (table === 'market_opportunities') {
        result = { data: [{ status: 'watchlisted' }, { status: 'dismissed' }], error: null };
      } else {
        result = { data: [], error: null };
      }
      return Promise.resolve(result).then(resolve, reject);
    },
  };
  return builder;
}

function installCacheStub(filePath, exports) {
  require.cache[filePath] = {
    id: filePath,
    filename: filePath,
    loaded: true,
    exports,
  };
}

const originalResolveFilename = Module._resolveFilename;
const originalLoad = Module._load;
const originalFetch = globalThis.fetch;
const networkEvidence = {
  fake_anthropic_transports: 0,
  blocked_real_outbound_attempts: 0,
  node_socket_attempts: 0,
  real_telegram_sends: 0,
  live_anthropic_calls: 0,
  live_supabase_calls: 0,
};
const networkOriginals = {
  httpRequest: http.request,
  httpGet: http.get,
  httpsRequest: https.request,
  httpsGet: https.get,
  netConnect: net.connect,
  netCreateConnection: net.createConnection,
  tlsConnect: tls.connect,
};

function blockedSocket() {
  networkEvidence.node_socket_attempts += 1;
  throw new Error('socket access is forbidden by the AI baseline harness');
}

function clearHarnessModules() {
  for (const filePath of Object.values(paths)) {
    try { delete require.cache[require.resolve(filePath)]; } catch { /* not loaded */ }
  }
}

function installHarness() {
  Module._resolveFilename = function resolveAlias(request, parent, isMain, options) {
    if (request.startsWith('@/')) {
      return originalResolveFilename.call(
        this,
        path.join(buildDir, request.slice(2)),
        parent,
        isMain,
        options,
      );
    }
    return originalResolveFilename.call(this, request, parent, isMain, options);
  };
  Module._load = function loadWithProviderStub(request, parent, isMain) {
    if (request === '@anthropic-ai/sdk') return FakeAnthropic;
    return originalLoad.call(this, request, parent, isMain);
  };

  installCacheStub(paths.requestAuth, {
    authenticateRequest: async () => ({
      authorized: true,
      user: { id: 'synthetic-baseline-user' },
      supabase: {},
    }),
  });
  installCacheStub(paths.supabaseServer, {
    createClient: async () => {
      const context = asyncContext.getStore();
      assert.ok(context, 'Supabase stub escaped async context');
      return {
        auth: {
          getUser: async () => ({
            data: { user: { id: 'synthetic-baseline-user' } },
          }),
        },
        from: table => queryBuilder(table, context),
      };
    },
  });
  installCacheStub(paths.supabaseAdmin, {
    createAdminClient: () => ({
      rpc: async (name, args) => {
        const context = asyncContext.getStore();
        assert.ok(context, 'admin persistence escaped async context');
        context.persistence_attempts += 1;
        context.persistence_calls.push(name);
        if (name === 'persist_analysis_decision') {
          return {
            data: {
              decision_id: `synthetic-decision-${context.request_id}`,
              analysis_run_id: `synthetic-run-${context.request_id}`,
            },
            error: null,
          };
        }
        if (name === 'persist_market_opportunities') {
          return {
            data: args.p_rows.map((row, index) => ({
              id: `synthetic-opportunity-${context.request_id}-${index + 1}`,
              ...row,
            })),
            error: null,
          };
        }
        if (name === 'persist_coaching_session') {
          return {
            data: {
              id: `synthetic-coach-${context.request_id}`,
              summary: args.p_summary,
              recommendations: args.p_recommendations,
              disclaimer: args.p_disclaimer,
            },
            error: null,
          };
        }
        throw new Error(`unexpected mocked RPC: ${name}`);
      },
    }),
  });
  installCacheStub(paths.analytics, {
    trackServerEvent: async () => {
      const context = asyncContext.getStore();
      if (context) context.analytics_events += 1;
    },
  });
  installCacheStub(paths.rateLimit, {
    RATE_LIMITS: {
      scanner: () => [{ limit: 5, seconds: 60 }, { limit: 30, seconds: 86400 }],
      analyst: () => [{ limit: 10, seconds: 60 }, { limit: 200, seconds: 86400 }],
      scout: () => [{ limit: 3, seconds: 60 }, { limit: 50, seconds: 86400 }],
      coach: () => [{ limit: 20, seconds: 86400 }],
    },
    enforceRateLimit: async () => ({
      allowed: true,
      unavailable: false,
      retryAfter: 0,
    }),
  });

  globalThis.fetch = fakeFetch;
  http.request = blockedSocket;
  http.get = blockedSocket;
  https.request = blockedSocket;
  https.get = blockedSocket;
  net.connect = blockedSocket;
  net.createConnection = blockedSocket;
  tls.connect = blockedSocket;
}

function restoreHarness() {
  clearHarnessModules();
  Module._resolveFilename = originalResolveFilename;
  Module._load = originalLoad;
  globalThis.fetch = originalFetch;
  http.request = networkOriginals.httpRequest;
  http.get = networkOriginals.httpGet;
  https.request = networkOriginals.httpsRequest;
  https.get = networkOriginals.httpsGet;
  net.connect = networkOriginals.netConnect;
  net.createConnection = networkOriginals.netCreateConnection;
  tls.connect = networkOriginals.tlsConnect;
}

function requestBody(flow, fixture) {
  if (flow === 'scanner') {
    const image = fixture.image_fixture === 'generated-over-limit'
      ? 'A'.repeat(10 * 1024 * 1024 + 1)
      : onePixelPng;
    return { image, media_type: fixture.media_type };
  }
  if (flow === 'analyst') {
    return {
      sport: fixture.sport,
      ...fixture.input,
      output_language: fixture.language,
    };
  }
  if (flow === 'scout') {
    return {
      sport: fixture.sport,
      context: fixture.input.context,
      timeframe: fixture.input.timeframe,
      output_language: fixture.language,
    };
  }
  return fixture.input;
}

function routeUrl(flow) {
  return {
    scanner: '/api/ai/scanner',
    analyst: '/api/ai/analyst',
    scout: '/api/scout',
    coach: '/api/coach',
  }[flow];
}

function runtimeLanguage(flow, fixture, body) {
  if (flow === 'analyst' && body?.data?.trust_view?.locale) return body.data.trust_view.locale;
  if (flow === 'scout') {
    const reasoning = body?.data?.opportunities?.[0]?.reasoning ?? '';
    if (!reasoning.includes(languageMarkers[fixture.language])) return 'unknown';
    return fixture.language === 'auto' ? 'en' : fixture.language;
  }
  if (flow === 'coach') {
    const summary = body?.data?.summary ?? '';
    return summary.includes(languageMarkers[fixture.language]) ? fixture.language : 'unknown';
  }
  return fixture.language;
}

function languageConsistency(flow, fixture, body) {
  if (flow === 'scanner') return null;
  const expected = fixture.language === 'auto' ? 'en' : fixture.language;
  return runtimeLanguage(flow, fixture, body) === expected;
}

async function runRoute(routes, flow, fixture, options = {}) {
  const context = {
    flow,
    fixture,
    request_id: options.requestId ?? fixture.id,
    fault: options.fault ?? null,
    delay_ms: options.delayMs ?? 0,
    web_search: Boolean(fixture.input?.web_search),
    provider_attempts: 0,
    provider_records: [],
    persistence_attempts: 0,
    persistence_calls: [],
    analytics_events: 0,
  };
  const request = new Request(`https://baseline.invalid${routeUrl(flow)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(requestBody(flow, fixture)),
  });
  const start = performance.now();
  const response = await asyncContext.run(context, () => routes[flow].POST(request));
  const durationMs = performance.now() - start;
  const body = await response.json();
  return {
    fixture_id: fixture.id,
    flow,
    status: response.status,
    duration_ms: durationMs,
    body,
    provider_attempts: context.provider_attempts,
    provider_records: context.provider_records,
    persistence_attempts: context.persistence_attempts,
    persistence_calls: context.persistence_calls,
    analytics_events: context.analytics_events,
  };
}

function compactFixtureResult(fixture, result) {
  const schemaValid = result.status === 200 && result.body?.success === true;
  const languageConsistent = languageConsistency(result.flow, fixture, result.body);
  const record = {
    fixture_id: fixture.id,
    flow: result.flow,
    sport: fixture.sport,
    language: fixture.language,
    class: fixture.class,
    status: result.status,
    schema_valid: schemaValid,
    provider_attempts: result.provider_attempts,
    persistence_attempts: result.persistence_attempts,
    persistence_rpc: result.persistence_calls,
    latency_ms: Number(result.duration_ms.toFixed(3)),
    language_consistent_at_route_output: languageConsistent,
    hard_failures: [],
  };

  if (result.flow === 'analyst' && schemaValid) {
    record.quality_gate_executed = Boolean(result.body?.data?.quality_gate);
    record.pricing_suppressed = (
      result.body?.data?.model_probability === null &&
      result.body?.data?.implied_probability === null &&
      result.body?.data?.edge_percent === null
    );
    record.research = {
      web_search_used: Boolean(result.body?.data?.web_search_used),
      source_count: result.body?.data?.research_sources?.length ?? 0,
      bound_claim_count: result.body?.data?.research_brief?.sourcedClaims?.length ?? 0,
    };
  }
  if (result.flow === 'scout' && schemaValid) {
    const opportunity = result.body?.data?.opportunities?.[0];
    record.pricing_suppressed = (
      opportunity?.model_probability === null &&
      opportunity?.implied_probability === null &&
      opportunity?.edge_percent === null
    );
    record.fallback_used = Boolean(result.body?.data?.fallback_used);
  }
  if (result.flow === 'coach' && schemaValid) {
    const serialized = JSON.stringify(result.body?.data ?? {}).toLowerCase();
    const forbidden = ['guaranteed', 'sure bet', 'must bet', 'all-in', 'chase losses', 'recover money', 'free money'];
    record.safety_contract = {
      forbidden_phrase_count: forbidden.filter(phrase => serialized.includes(phrase)).length,
      retrospective_disclaimer_present: serialized.includes('past performance does not predict future results'),
    };
  }
  if (result.flow === 'scanner' && schemaValid) {
    record.extracted = {
      event_name: result.body?.data?.event_name ?? null,
      selection: result.body?.data?.selection ?? null,
      leg_count: result.body?.data?.legs?.length ?? 0,
    };
  }

  const expected = fixture.expected;
  if (result.status !== expected.status) record.hard_failures.push(`status ${result.status} != ${expected.status}`);
  if (result.provider_attempts !== expected.provider_attempts) {
    record.hard_failures.push(`provider attempts ${result.provider_attempts} != ${expected.provider_attempts}`);
  }
  if (result.persistence_attempts !== expected.persistence_attempts) {
    record.hard_failures.push(`persistence attempts ${result.persistence_attempts} != ${expected.persistence_attempts}`);
  }
  if (schemaValid !== expected.schema_valid) {
    record.hard_failures.push(`schema_valid ${schemaValid} != ${expected.schema_valid}`);
  }
  if (expected.event_name && record.extracted?.event_name !== expected.event_name) {
    record.hard_failures.push('scanner event_name mismatch');
  }
  if (expected.selection && record.extracted?.selection !== expected.selection) {
    record.hard_failures.push('scanner selection mismatch');
  }
  if (expected.web_search_used !== undefined && record.research?.web_search_used !== expected.web_search_used) {
    record.hard_failures.push('analyst web_search_used mismatch');
  }
  if (expected.bound_citations !== undefined && record.research?.bound_claim_count !== expected.bound_citations) {
    record.hard_failures.push('analyst bound citation count mismatch');
  }
  if (expected.fallback_used !== undefined && record.fallback_used !== expected.fallback_used) {
    record.hard_failures.push('scout fallback_used mismatch');
  }
  if (result.flow === 'analyst' && schemaValid) {
    if (!record.quality_gate_executed) record.hard_failures.push('analyst quality gate missing');
    if (!record.pricing_suppressed) record.hard_failures.push('analyst pricing quarantine bypassed');
  }
  if (result.flow === 'scout' && schemaValid && !record.pricing_suppressed) {
    record.hard_failures.push('scout pricing quarantine bypassed');
  }
  if (result.flow === 'coach' && schemaValid) {
    if (record.safety_contract.forbidden_phrase_count !== 0) {
      record.hard_failures.push('coach forbidden phrase accepted');
    }
    if (!record.safety_contract.retrospective_disclaimer_present) {
      record.hard_failures.push('coach retrospective disclaimer missing');
    }
  }
  return record;
}

async function runFixtureSuite(routes) {
  const records = [];
  for (const flow of fixtureFiles) {
    for (const fixture of datasets[flow].fixtures) {
      const result = await runRoute(routes, flow, fixture);
      const compact = compactFixtureResult(fixture, result);
      checkEqual(compact.hard_failures, [], `${fixture.id}: route contract`);
      records.push(compact);
    }
  }
  return records;
}

const faultExpected = {
  scanner: { timeout: 504, rate_limit: 502, server_error: 502, malformed: 422 },
  analyst: { timeout: 504, rate_limit: 429, server_error: 500, malformed: 502 },
  scout: { timeout: 504, rate_limit: 429, server_error: 503, malformed: 502 },
  coach: { timeout: 500, rate_limit: 500, server_error: 500, malformed: 502 },
};

async function runFaultMatrix(routes) {
  const records = [];
  for (const flow of fixtureFiles) {
    const base = datasets[flow].fixtures.find(fixture => fixture.class === 'success');
    for (const fault of ['timeout', 'rate_limit', 'server_error', 'malformed']) {
      const fixture = {
        ...base,
        id: `${flow}-fault-${fault}`,
        class: 'error',
        mock_output_template: fault === 'malformed' ? 'malformed' : base.mock_output_template,
        input: { ...(base.input ?? {}), web_search: false },
      };
      const result = await runRoute(routes, flow, fixture, { fault });
      const record = {
        flow,
        fault,
        status: result.status,
        expected_status: faultExpected[flow][fault],
        provider_attempts: result.provider_attempts,
        persistence_attempts: result.persistence_attempts,
        safe_no_persistence: result.persistence_attempts === 0,
      };
      checkEqual(record.status, record.expected_status, `${flow}/${fault}: error classification`);
      check(record.provider_attempts === 1, `${flow}/${fault}: exactly one provider attempt`);
      check(record.safe_no_persistence, `${flow}/${fault}: no persistence`);
      records.push(record);
    }
  }
  return records;
}

function percentile(values, p) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1);
  return Number(sorted[Math.max(0, index)].toFixed(3));
}

function estimatedTokens(bytes) {
  return Math.ceil(bytes / 4);
}

function costUsd(inputTokens, outputTokens) {
  const input = inputTokens * priceCard.per_million_tokens.base_input / 1_000_000;
  const output = outputTokens * priceCard.per_million_tokens.output / 1_000_000;
  return Number((input + output).toFixed(8));
}

function summarizeProviderRecords(results) {
  const records = results.flatMap(result => result.provider_records);
  const inputBytes = records.reduce((sum, record) => sum + record.request_bytes, 0);
  const outputBytes = records.reduce((sum, record) => sum + record.response_bytes, 0);
  const inputTokens = estimatedTokens(inputBytes);
  const outputTokens = estimatedTokens(outputBytes);
  return {
    provider_attempts: records.length,
    input_bytes: inputBytes,
    output_bytes: outputBytes,
    estimated_input_tokens: inputTokens,
    estimated_output_tokens: outputTokens,
    estimated_cost_usd: costUsd(inputTokens, outputTokens),
  };
}

async function runPerformanceProfile(routes) {
  const records = [];
  const requestCount = 50;
  for (const flow of fixtureFiles) {
    const fixture = datasets[flow].fixtures.find(f => f.class === 'success' && f.language === 'en')
      ?? datasets[flow].fixtures.find(f => f.class === 'success');
    for (const concurrency of [1, 5, 10, 25]) {
      let next = 0;
      const results = [];
      const start = performance.now();
      const workers = Array.from({ length: concurrency }, async (_, workerIndex) => {
        while (true) {
          const index = next;
          next += 1;
          if (index >= requestCount) return;
          const result = await runRoute(routes, flow, fixture, {
            requestId: `${flow}-c${concurrency}-w${workerIndex}-r${index}`,
            delayMs: 3,
          });
          results.push(result);
        }
      });
      await Promise.all(workers);
      const wallMs = performance.now() - start;
      const successes = results.filter(result => result.status === 200).length;
      const errors = results.length - successes;
      const timeouts = results.filter(result => result.status === 504).length;
      const duplicatePersistenceWithinRequest = results.reduce(
        (sum, result) => sum + Math.max(0, result.persistence_attempts - (flow === 'scanner' ? 0 : 1)),
        0,
      );
      const sizes = summarizeProviderRecords(results);
      const record = {
        flow,
        concurrency,
        requests: results.length,
        successes,
        errors,
        timeouts,
        success_rate: Number((successes / results.length).toFixed(4)),
        error_rate: Number((errors / results.length).toFixed(4)),
        p50_ms: percentile(results.map(result => result.duration_ms), 0.50),
        p95_ms: percentile(results.map(result => result.duration_ms), 0.95),
        p99_ms: percentile(results.map(result => result.duration_ms), 0.99),
        wall_ms: Number(wallMs.toFixed(3)),
        throughput_requests_per_second: Number((results.length / (wallMs / 1000)).toFixed(3)),
        provider_attempts: sizes.provider_attempts,
        provider_attempts_per_request: Number((sizes.provider_attempts / results.length).toFixed(3)),
        duplicate_persistence_within_request: duplicatePersistenceWithinRequest,
        input_bytes_total: sizes.input_bytes,
        output_bytes_total: sizes.output_bytes,
        estimated_input_tokens: sizes.estimated_input_tokens,
        estimated_output_tokens: sizes.estimated_output_tokens,
        estimated_cost_usd: sizes.estimated_cost_usd,
      };
      checkEqual(record.requests, requestCount, `${flow}/c${concurrency}: request count`);
      checkEqual(record.successes, requestCount, `${flow}/c${concurrency}: all mocked route requests succeed`);
      checkEqual(record.errors, 0, `${flow}/c${concurrency}: no route errors`);
      checkEqual(record.duplicate_persistence_within_request, 0, `${flow}/c${concurrency}: no duplicate persistence within request`);
      records.push(record);
    }
  }
  return records;
}

async function runReplayProbe(routes) {
  const records = [];
  for (const flow of fixtureFiles) {
    const fixture = datasets[flow].fixtures.find(f => f.class === 'success');
    const first = await runRoute(routes, flow, fixture, { requestId: `${flow}-replay-a` });
    const second = await runRoute(routes, flow, fixture, { requestId: `${flow}-replay-b` });
    const persistenceWrites = first.persistence_attempts + second.persistence_attempts;
    const record = {
      flow,
      identical_payload_requests: 2,
      provider_attempts: first.provider_attempts + second.provider_attempts,
      persistence_writes: persistenceWrites,
      idempotency_or_dedup_observed: false,
      interpretation: flow === 'scanner'
        ? 'Scanner performs provider work twice and has no persistence.'
        : 'The same admitted payload performs provider work and persistence twice; current routes expose no AI idempotency key.',
    };
    checkEqual(record.provider_attempts, 2, `${flow}: identical replay repeats provider work`);
    checkEqual(record.persistence_writes, flow === 'scanner' ? 0 : 2, `${flow}: current replay persistence behavior`);
    records.push(record);
  }
  return records;
}

function qualitySummary(fixtureRecords) {
  const byFlow = {};
  for (const flow of fixtureFiles) {
    const flowRecords = fixtureRecords.filter(record => record.flow === flow);
    const localeRecords = new Map();
    for (const record of flowRecords.filter(record => record.class === 'success')) {
      if (!localeRecords.has(record.language)) localeRecords.set(record.language, record);
    }
    const languageMeasured = [...localeRecords.values()]
      .filter(record => record.language_consistent_at_route_output !== null);
    byFlow[flow] = {
      fixture_contracts: flowRecords.length,
      schema_expectations_met: flowRecords.filter(record => record.hard_failures.length === 0).length,
      deterministic_route_language_consistency: languageMeasured.length > 0
        ? {
            passed: languageMeasured.filter(record => record.language_consistent_at_route_output).length,
            measured: languageMeasured.length,
          }
        : 'NOT_APPLICABLE',
      live_model_quality: 'NOT_MEASURED',
      factual_grounding: flow === 'analyst'
        ? 'Citation binding is measured with a synthetic citation; factual truth is NOT_MEASURED.'
        : 'NOT_MEASURED',
      completeness_consistency_safety: 'Only deterministic route/schema gates are measured; semantic live-model quality is NOT_MEASURED.',
    };
  }
  return byFlow;
}

function parseArgs(argv) {
  const args = { output: null, report: null };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--output') args.output = argv[++index];
    else if (argv[index] === '--report') args.report = argv[++index];
    else throw new Error(`unknown argument: ${argv[index]}`);
  }
  return args;
}

function reportMarkdown(result) {
  const lines = [
    '# AI baseline report — mocked route execution',
    '',
    `Generated: ${result.generated_at}`,
    '',
    `Runtime commit: \`${result.runtime.commit}\``,
    '',
    `Dataset: \`${result.dataset.version}\``,
    '',
    `Price card: \`${result.cost.price_card_id}\``,
    '',
    'Status: **NOT SCALE READY**',
    '',
    '## Scope and interpretation',
    '',
    '- All provider, Supabase, rate-limit, persistence, and analytics transports were injected fakes.',
    '- Latency and throughput are local mocked route overhead, not Vercel, Supabase, or Anthropic capacity measurements.',
    '- `ESTIMATED` token/cost values use UTF-8 bytes / 4 and the versioned list-price snapshot.',
    '- `ACTUAL` provider usage and invoice cost are `BLOCKED / NOT MEASURED` because no authorized usage export was supplied.',
    '- No live-model semantic quality result is inferred from deterministic mock output.',
    '',
    '## Flow results',
    '',
    '| Flow | Fixture contracts | Schema expectations | Route-language consistency | Live-model quality |',
    '| --- | ---: | ---: | --- | --- |',
  ];
  for (const flow of fixtureFiles) {
    const quality = result.quality[flow];
    const language = typeof quality.deterministic_route_language_consistency === 'object'
      ? `${quality.deterministic_route_language_consistency.passed}/${quality.deterministic_route_language_consistency.measured}`
      : quality.deterministic_route_language_consistency;
    lines.push(`| ${flow} | ${quality.fixture_contracts} | ${quality.schema_expectations_met}/${quality.fixture_contracts} | ${language} | NOT MEASURED |`);
  }
  lines.push(
    '',
    'The Analyst route accepts eight locale modes but the FP-001 trust surface has only `uk` and `en` locale implementations. The deterministic baseline therefore records non-Ukrainian explicit locales as English at the protected route output. This is evidence, not a runtime change.',
    '',
    '## Mocked performance',
    '',
    '| Flow | C | Requests | Success | p50 ms | p95 ms | p99 ms | req/s | Estimated USD / cell |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
  );
  for (const row of result.performance) {
    lines.push(`| ${row.flow} | ${row.concurrency} | ${row.requests} | ${row.successes} | ${row.p50_ms} | ${row.p95_ms} | ${row.p99_ms} | ${row.throughput_requests_per_second} | ${row.estimated_cost_usd.toFixed(8)} |`);
  }
  lines.push(
    '',
    '## Fault classification',
    '',
    '| Flow | Fault | HTTP | Provider attempts | Persistence |',
    '| --- | --- | ---: | ---: | ---: |',
  );
  for (const row of result.fault_matrix) {
    lines.push(`| ${row.flow} | ${row.fault} | ${row.status} | ${row.provider_attempts} | ${row.persistence_attempts} |`);
  }
  lines.push(
    '',
    '## Current replay behavior',
    '',
    '| Flow | Same payloads | Provider attempts | Persistence writes |',
    '| --- | ---: | ---: | ---: |',
  );
  for (const row of result.replay_probe) {
    lines.push(`| ${row.flow} | ${row.identical_payload_requests} | ${row.provider_attempts} | ${row.persistence_writes} |`);
  }
  lines.push(
    '',
    'No AI route currently exposes request idempotency or result deduplication. Replays therefore repeat provider work; Analyst, Scout, and Coach also repeat persistence.',
    '',
    '## Cost method',
    '',
    `- Source: ${result.cost.source}`,
    `- Input: $${result.cost.input_usd_per_million}/MTok; output: $${result.cost.output_usd_per_million}/MTok.`,
    '- Token estimate: `ceil(UTF-8 serialized request or response bytes / 4)` per aggregate.',
    '- Scanner vision input is only a serialization proxy; image tokenization and tool fees are not represented.',
    '- Actual usage, cache-token categories, web-search fees, discounts, tax, and invoice reconciliation are `BLOCKED / NOT MEASURED`.',
    '',
    '## Required future measurements',
    '',
    '- Live-model quality by flow, sport, and language: **NOT MEASURED**.',
    '- Production-like Vercel/Supabase latency, capacity, connection headroom, and 1000+ session load: **NOT MEASURED**.',
    '- Approved provider usage export and invoice reconciliation: **BLOCKED**.',
    '- Quality non-inferiority tolerance, latency/error SLOs, burst size, soak duration, and financial guardrails: **TBD**.',
    '- Anthropic web-search fees and Scanner vision token estimator: **TBD**.',
    '',
    '## Safety evidence',
    '',
    `- Fake Anthropic transports: ${result.network.fake_anthropic_transports}`,
    `- Real outbound fetch attempts: ${result.network.blocked_real_outbound_attempts}`,
    `- Node socket attempts: ${result.network.node_socket_attempts}`,
    `- Live Anthropic calls: ${result.network.live_anthropic_calls}`,
    `- Live Supabase calls: ${result.network.live_supabase_calls}`,
    `- Telegram sends: ${result.network.real_telegram_sends}`,
    `- Runtime/mobile/migration diff: ${result.runtime.runtime_files_changed.length === 0 ? 'none' : result.runtime.runtime_files_changed.join(', ')}`,
    '',
    '## Rerun',
    '',
    '```powershell',
    'npm ci',
    'npm run test:ai-baseline',
    'npm run build:provider-scripts',
    'node scripts/ai-baseline-harness.mjs --output <result.json> --report <report.md>',
    '```',
    '',
  );
  return `${lines.join('\n').trimEnd()}\n`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  validateDataset();
  const staticAudit = staticContractAudit();
  const documentationLinks = changedDocumentationLinkAudit();

  const envKeys = [
    'ANTHROPIC_API_KEY',
    'ANTHROPIC_MODEL_ANALYST',
    'ANTHROPIC_MODEL_SCOUT',
    'ANTHROPIC_MODEL_COACH',
    'ANTHROPIC_WEB_SEARCH_ENABLED',
  ];
  const savedEnv = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));
  process.env.ANTHROPIC_API_KEY = 'offline-baseline-placeholder-not-a-token';
  delete process.env.ANTHROPIC_MODEL_ANALYST;
  delete process.env.ANTHROPIC_MODEL_SCOUT;
  delete process.env.ANTHROPIC_MODEL_COACH;
  process.env.ANTHROPIC_WEB_SEARCH_ENABLED = 'true';

  let routes;
  let fixtureRecords;
  let faultMatrix;
  let performanceRecords;
  let replayProbe;
  try {
    clearHarnessModules();
    installHarness();
    routes = {
      scanner: require(paths.scannerRoute),
      analyst: require(paths.analystRoute),
      scout: require(paths.scoutRoute),
      coach: require(paths.coachRoute),
    };
    fixtureRecords = await runFixtureSuite(routes);
    faultMatrix = await runFaultMatrix(routes);
    performanceRecords = await runPerformanceProfile(routes);
    replayProbe = await runReplayProbe(routes);
  } finally {
    restoreHarness();
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }

  checkEqual(networkEvidence.blocked_real_outbound_attempts, 0, 'no real outbound fetch attempted');
  checkEqual(networkEvidence.node_socket_attempts, 0, 'no node socket attempted');
  checkEqual(networkEvidence.live_anthropic_calls, 0, 'no live Anthropic call');
  checkEqual(networkEvidence.live_supabase_calls, 0, 'no live Supabase call');
  checkEqual(networkEvidence.real_telegram_sends, 0, 'no Telegram send');

  const result = {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    status: failedAssertions === 0 ? 'BASELINE HARNESS PASS; NOT SCALE READY' : 'BASELINE HARNESS HOLD',
    runtime: {
      repository: 'xadddd88/bettracker-v1',
      commit: runtimeCommit,
      tree: git('rev-parse', `${runtimeCommit}^{tree}`),
      harness_worktree_head: git('rev-parse', 'HEAD'),
      runtime_files_changed: staticAudit.runtime_files_changed,
      evidence: staticAudit.evidence,
    },
    dataset: {
      version: 'ai-baseline-v1',
      fixture_count: fixtureRecords.length,
      files: fixtureFiles.map(flow => `docs/ai-baseline/fixtures/v1/${flow}.json`),
      contract: 'docs/ai-baseline/fixtures/v1/contracts.json',
    },
    documentation: {
      checked_internal_links: documentationLinks,
    },
    environment: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      logical_cpu_count: os.cpus().length,
      total_memory_bytes: os.totalmem(),
      execution_class: 'LOCAL MOCKED ROUTE OVERHEAD',
    },
    fixtures: fixtureRecords,
    quality: qualitySummary(fixtureRecords),
    fault_matrix: faultMatrix,
    performance: performanceRecords,
    replay_probe: replayProbe,
    cost: {
      classification: 'ESTIMATED',
      method: 'ceil(UTF-8 serialized request/response bytes / 4) multiplied by versioned standard list price',
      price_card_id: priceCard.price_card_id,
      source: priceCard.source,
      observed_at: priceCard.observed_at,
      currency: priceCard.currency,
      input_usd_per_million: priceCard.per_million_tokens.base_input,
      output_usd_per_million: priceCard.per_million_tokens.output,
      scanner_vision_caveat: 'Serialization proxy only; provider image tokenization is NOT MEASURED.',
      actual_provider_usage: 'BLOCKED / NOT MEASURED',
      actual_invoice_cost: 'BLOCKED / NOT MEASURED',
    },
    network: networkEvidence,
    assertions: {
      passed: passedAssertions,
      failed: failedAssertions,
      failures: assertionFailures,
    },
    limitations: [
      'Mocked transport cannot establish live-model semantic quality.',
      'Mocked local latency and throughput cannot establish Vercel, Supabase, or Anthropic capacity.',
      'Character/byte token proxies are not provider usage.',
      'Scanner vision tokens and Anthropic web-search fees are not estimated.',
      'No provider usage export or invoice was authorized, so actual cost is blocked.',
      'No queue exists in the current runtime; queue depth, backpressure, and terminal delivery are not measured.',
      'Thresholds for scale, latency, quality non-inferiority, and spend remain TBD.',
    ],
    thresholds: {
      performance: 'PROPOSED / TBD',
      quality_non_inferiority: 'PROPOSED / TBD',
      simultaneous_ai_burst: 'PROPOSED / TBD',
      daily_monthly_budget: 'PROPOSED / TBD',
    },
  };

  if (args.output) {
    const outputPath = path.resolve(repoRoot, args.output);
    mkdirSync(path.dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  }
  if (args.report) {
    const reportPath = path.resolve(repoRoot, args.report);
    mkdirSync(path.dirname(reportPath), { recursive: true });
    writeFileSync(reportPath, reportMarkdown(result), 'utf8');
  }

  console.log(`AI baseline fixtures: ${fixtureRecords.length}`);
  console.log(`Assertions: ${passedAssertions} passed, ${failedAssertions} failed`);
  console.log('Execution: LOCAL MOCKED ROUTE OVERHEAD');
  console.log('Live provider/Supabase/Telegram sends: 0');
  console.log('Actual provider usage/invoice: BLOCKED / NOT MEASURED');
  console.log('Scale readiness: NOT SCALE READY');
  if (args.output) console.log(`JSON: ${path.resolve(repoRoot, args.output)}`);
  if (args.report) console.log(`Report: ${path.resolve(repoRoot, args.report)}`);

  if (failedAssertions > 0) {
    for (const failure of assertionFailures) console.error(`FAIL: ${failure}`);
    process.exitCode = 1;
  }
}

await main();
