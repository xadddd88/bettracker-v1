import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import ts from 'typescript';

const root = process.cwd();

const ALLOWED_CAPTURE_EXTERNAL_IMPORTS = new Set([
  'expo-file-system',
  'expo-image-manipulator',
  'expo-image-picker',
]);

type ImportGraph = {
  externalImports: Set<string>;
  files: Set<string>;
};

type LocalImportResolver = (importer: string, specifier: string) => string | null;
type SourceReader = (path: string) => string;

const readSourceFile: SourceReader = (path) => readFileSync(path, 'utf8');

const FORBIDDEN_NETWORK_PATTERNS = [
  /\bfetch\b/,
  /\bXMLHttpRequest\b/,
  /\bWebSocket\b/,
  /\bEventSource\b/,
  /\bexpo\/fetch\b/i,
  /\baxios\b/i,
  /\/api\//,
  /\bsupabase\b/i,
  /\.rpc\s*\(/,
  /service[_-]?role/i,
  /ANTHROPIC_API_KEY/,
  /OPENAI_API_KEY/,
] as const;

const NETWORK_GLOBALS = new Set(['global', 'globalThis', 'self', 'window']);
const NETWORK_PROPERTIES = new Set(['EventSource', 'XMLHttpRequest', 'WebSocket', 'fetch']);

function moduleSpecifiers(path: string, source: string): string[] {
  const sourceFile = ts.createSourceFile(
    path,
    source,
    ts.ScriptTarget.Latest,
    true,
    path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const specifiers: string[] = [];

  function visit(node: ts.Node) {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteralLike(node.moduleSpecifier)
    ) {
      specifiers.push(node.moduleSpecifier.text);
    }

    if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === 'require'))
    ) {
      assert.equal(node.arguments.length, 1, `AI imports require one static specifier in ${path}`);
      assert.ok(
        ts.isStringLiteralLike(node.arguments[0]),
        `AI imports must use a static string specifier in ${path}`,
      );
      specifiers.push(node.arguments[0].text);
    }

    if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference) &&
      node.moduleReference.expression
    ) {
      assert.ok(
        ts.isStringLiteralLike(node.moduleReference.expression),
        `AI imports must use a static string specifier in ${path}`,
      );
      specifiers.push(node.moduleReference.expression.text);
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return specifiers;
}

function resolveLocalImport(importer: string, specifier: string): string | null {
  const unresolved = specifier.startsWith('@/')
    ? join(root, 'src', specifier.slice(2))
    : specifier.startsWith('.')
      ? resolve(dirname(importer), specifier)
      : null;

  if (!unresolved) return null;

  const candidates = [
    unresolved,
    `${unresolved}.ts`,
    `${unresolved}.tsx`,
    join(unresolved, 'index.ts'),
    join(unresolved, 'index.tsx'),
  ];
  const resolved = candidates.find((candidate) => existsSync(candidate));

  assert.ok(resolved, `local AI import must resolve: ${specifier} from ${importer}`);
  return resolved;
}

function collectImportGraph(
  entrypoint: string,
  readSource: SourceReader = readSourceFile,
  resolveImport: LocalImportResolver = resolveLocalImport,
): ImportGraph {
  const graph: ImportGraph = {
    externalImports: new Set(),
    files: new Set(),
  };
  const pending = [entrypoint];

  while (pending.length > 0) {
    const path = pending.pop();
    if (!path || graph.files.has(path)) continue;

    graph.files.add(path);
    for (const specifier of moduleSpecifiers(path, readSource(path))) {
      const localPath = resolveImport(path, specifier);
      if (localPath) {
        pending.push(localPath);
      } else {
        graph.externalImports.add(specifier);
      }
    }
  }

  return graph;
}

function assertNetworkFreeSource(path: string, source: string) {
  for (const forbidden of FORBIDDEN_NETWORK_PATTERNS) {
    assert.doesNotMatch(source, forbidden, `network boundary violation in ${path}`);
  }

  const sourceFile = ts.createSourceFile(
    path,
    source,
    ts.ScriptTarget.Latest,
    true,
    path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

  function fail(reason: string): never {
    assert.fail(`network boundary violation in ${path}: ${reason}`);
  }

  function visit(node: ts.Node) {
    if (ts.isIdentifier(node) && NETWORK_PROPERTIES.has(node.text)) {
      fail(node.text);
    }

    if (ts.isPropertyAccessExpression(node)) {
      const receiver = unwrapExpression(node.expression);

      if (
        ts.isIdentifier(receiver) &&
        NETWORK_GLOBALS.has(receiver.text) &&
        NETWORK_PROPERTIES.has(node.name.text)
      ) {
        fail(`${receiver.text}.${node.name.text}`);
      }

      if (
        ts.isIdentifier(receiver) &&
        receiver.text === 'Linking' &&
        node.name.text === 'openURL'
      ) {
        fail('Linking.openURL');
      }
    }

    if (ts.isElementAccessExpression(node)) {
      const receiver = unwrapExpression(node.expression);
      const key = unwrapExpression(node.argumentExpression);
      const property = staticStringValue(node.argumentExpression);

      if (property !== null && NETWORK_PROPERTIES.has(property)) {
        fail(`['${property}'] network property key on any receiver`);
      }

      if (!ts.isStringLiteralLike(key) && !ts.isNumericLiteral(key)) {
        fail('computed element access key (only literal string and numeric keys are allowed)');
      }

      if (
        ts.isIdentifier(receiver) &&
        NETWORK_GLOBALS.has(receiver.text) &&
        (property === null || NETWORK_PROPERTIES.has(property))
      ) {
        fail(`${receiver.text}[computed network property]`);
      }

      if (ts.isIdentifier(receiver) && receiver.text === 'Linking' && property === 'openURL') {
        fail('Linking[openURL]');
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
}

function unwrapExpression(node: ts.Expression): ts.Expression {
  let current = node;

  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isNonNullExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isSatisfiesExpression(current)
  ) {
    current = current.expression;
  }

  return current;
}

function staticStringValue(node: ts.Expression | undefined): string | null {
  if (!node) return null;
  if (ts.isStringLiteralLike(node)) return node.text;

  if (
    ts.isParenthesizedExpression(node) ||
    ts.isAsExpression(node) ||
    ts.isNonNullExpression(node) ||
    ts.isTypeAssertionExpression(node) ||
    ts.isSatisfiesExpression(node)
  ) {
    return staticStringValue(node.expression);
  }

  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const left = staticStringValue(node.left);
    const right = staticStringValue(node.right);
    return left === null || right === null ? null : left + right;
  }

  return null;
}

function assertNetworkFreeGraph(graph: ImportGraph, readSource: SourceReader) {
  for (const path of graph.files) {
    assertNetworkFreeSource(path, readSource(path));
  }
}

test('Mobile Phase 1B declares compatible capture dependencies and permissions', () => {
  const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
    dependencies?: Record<string, string>;
  };
  const appJson = JSON.parse(readFileSync(join(root, 'app.json'), 'utf8')) as {
    expo?: { plugins?: unknown[] };
  };

  for (const dependency of ['expo-image-picker', 'expo-image-manipulator', 'expo-network']) {
    assert.equal(typeof packageJson.dependencies?.[dependency], 'string', `${dependency} must be installed`);
  }

  const imagePickerPlugin = appJson.expo?.plugins?.find(
    (plugin): plugin is [string, Record<string, unknown>] =>
      Array.isArray(plugin) && plugin[0] === 'expo-image-picker',
  );

  assert.ok(imagePickerPlugin, 'expo-image-picker config plugin must be present');
  assert.equal(typeof imagePickerPlugin[1].cameraPermission, 'string');
  assert.equal(typeof imagePickerPlugin[1].photosPermission, 'string');
  assert.equal(imagePickerPlugin[1].microphonePermission, false);
});

test('Mobile Phase 1B capture pipeline remains local-only', () => {
  const entrypoint = join(root, 'src/ai/image-capture.ts');
  const graph = collectImportGraph(entrypoint);
  const expectedTransitiveFiles = [
    entrypoint,
    join(root, 'src/ai/image-cache-lifecycle.ts'),
    join(root, 'src/ai/image-cache.ts'),
    join(root, 'src/ai/image-policy.ts'),
  ];

  for (const path of expectedTransitiveFiles) {
    assert.ok(graph.files.has(path), `AI import graph must include: ${path}`);
  }

  assert.deepEqual(
    [...graph.externalImports].sort(),
    [...ALLOWED_CAPTURE_EXTERNAL_IMPORTS].sort(),
    'capture pipeline imports must stay on the approved local-only allowlist',
  );
  assertNetworkFreeGraph(graph, readSourceFile);
});

test('Mobile scanner uses one audited authenticated network seam', () => {
  const screenPath = join(root, 'src/app/(app)/ai/index.tsx');
  const clientPath = join(root, 'src/ai/scanner-client.ts');
  const modelPath = join(root, 'src/ai/scanner-model.ts');
  const apiClientPath = join(root, 'src/lib/api-client.ts');
  const screen = readSourceFile(screenPath);
  const client = readSourceFile(clientPath);
  const model = readSourceFile(modelPath);
  const apiClient = readSourceFile(apiClientPath);

  assert.match(screen, /from ['"]@\/ai\/scanner-client['"]/);
  assert.match(screen, /scanPreparedCoupon\(prepared\)/);
  assert.doesNotMatch(screen, /\bfetch\b|\bsupabase\b|\/api\/|service[_-]?role|ANTHROPIC_API_KEY|OPENAI_API_KEY/i);

  assert.match(client, /from ['"]@\/lib\/api-client['"]/);
  assert.match(client, /from ['"]@\/lib\/supabase['"]/);
  assert.match(client, /path:\s*['"]\/api\/ai\/scanner['"]/);
  assert.match(client, /auth\.getSession\(\)/);
  assert.match(client, /auth\.refreshSession\(\)/);
  assert.deepEqual(
    moduleSpecifiers(clientPath, client).sort(),
    ['./image-capture', './scanner-model', '@/lib/api-client', '@/lib/supabase'].sort(),
    'scanner client imports must stay on the audited allowlist',
  );
  assert.doesNotMatch(client, /\bfetch\b|service[_-]?role|ANTHROPIC_API_KEY|OPENAI_API_KEY|console\./i);

  assert.match(apiClient, /Authorization:\s*`Bearer \$\{token\}`/);
  assert.match(apiClient, /await fetchImpl\(/);
  assert.equal((apiClient.match(/await fetchImpl\(/g) ?? []).length, 1, 'all mobile API requests must use the single request helper');
  assert.doesNotMatch(apiClient, /\bsupabase\b|service[_-]?role|ANTHROPIC_API_KEY|OPENAI_API_KEY|console\./i);

  assert.match(model, /MAX_SCANNER_LEGS\s*=\s*20/);
  assert.match(model, /MAX_SCANNER_REQUEST_BYTES\s*=\s*4_400_000/);
  assert.doesNotMatch(model, /rawText|console\./);
});

const NETWORK_BOUNDARY_FIXTURES = [
  {
    name: 'direct fetch',
    source: `fetch('https://example.test');`,
  },
  {
    name: 'computed globalThis fetch',
    source: `globalThis['fe' + 'tch']('https://example.test');`,
  },
  {
    name: 'parenthesized receiver computed fetch',
    source: `(globalThis)['fe' + 'tch']('https://example.test');`,
  },
  {
    name: 'type-cast receiver computed fetch',
    source: `(globalThis as Record<string, unknown>)['fe' + 'tch'];`,
  },
  {
    name: 'aliased receiver computed fetch',
    source: `const g = globalThis; g['fe' + 'tch'];`,
  },
  {
    name: 'computed global XMLHttpRequest',
    source: `global['XML' + 'HttpRequest'];`,
  },
  {
    name: 'computed window WebSocket',
    source: `window['Web' + 'Socket'];`,
  },
  {
    name: 'computed self EventSource',
    source: `self['Event' + 'Source'];`,
  },
  {
    name: 'XMLHttpRequest',
    source: `new XMLHttpRequest();`,
  },
  {
    name: 'WebSocket',
    source: `new WebSocket('wss://example.test');`,
  },
  {
    name: 'EventSource',
    source: `new EventSource('https://example.test/events');`,
  },
  {
    name: 'Linking openURL',
    source: `Linking.openURL('https://example.test');`,
  },
] as const;

for (const fixture of NETWORK_BOUNDARY_FIXTURES) {
  test(`network boundary rejects ${fixture.name}`, () => {
    assert.throws(
      () => assertNetworkFreeSource(`${fixture.name}.tsx`, fixture.source),
      /network boundary violation/,
    );
  });
}

test('network boundary allows the approved Linking settings action', () => {
  assert.doesNotThrow(() =>
    assertNetworkFreeSource('settings.tsx', `await Linking.openSettings();`),
  );
});

test('network boundary rejects a network helper in a transitive local import', () => {
  const fixtureRoot = join(root, '__network-boundary-fixture__');
  const entrypoint = join(fixtureRoot, 'entry.ts');
  const helper = join(fixtureRoot, 'network-helper.ts');
  const sources = new Map([
    [entrypoint, `import './network-helper';`],
    [helper, `globalThis['fe' + 'tch']('https://example.test');`],
  ]);
  const readFixture: SourceReader = (path) => {
    const source = sources.get(path);
    assert.notEqual(source, undefined, `fixture source must exist: ${path}`);
    return source ?? '';
  };
  const resolveFixture: LocalImportResolver = (importer, specifier) => {
    if (!specifier.startsWith('.')) return null;
    const unresolved = resolve(dirname(importer), specifier);
    return [unresolved, `${unresolved}.ts`, join(unresolved, 'index.ts')].find((path) =>
      sources.has(path),
    ) ?? null;
  };
  const graph = collectImportGraph(entrypoint, readFixture, resolveFixture);

  assert.ok(graph.files.has(helper), 'transitive network helper must be scanned');
  assert.throws(
    () => assertNetworkFreeGraph(graph, readFixture),
    /network boundary violation/,
  );
});

test('AI capture screen applies Android top safe area without a second bottom inset', () => {
  const path = join(root, 'src/app/(app)/ai/index.tsx');
  const source = readFileSync(path, 'utf8');

  assert.match(source, /useSafeAreaInsets/);
  assert.match(source, /Platform\.OS\s*===\s*['"]android['"]/);
  assert.match(source, /safeAreaInsets\.top/);
  assert.doesNotMatch(source, /safeAreaInsets\.bottom/);
});

test('Expo Tabs owns the bottom safe area without an overlaid custom bar', () => {
  const path = join(root, 'src/app/(app)/_layout.tsx');
  const source = readFileSync(path, 'utf8');

  assert.match(source, /import \{ Tabs \} from 'expo-router'/);
  assert.match(source, /tabBarStyle/);
  assert.match(source, /useSafeAreaInsets\(\)/);
  assert.match(source, /height:\s*58\s*\+\s*insets\.bottom/);
  assert.match(source, /paddingBottom:\s*Math\.max\(insets\.bottom,\s*6\)/);
  assert.doesNotMatch(source, /position:\s*['"]absolute['"]/);
  assert.equal(existsSync(join(root, 'src/ui/bottom-navigation.tsx')), false);
});

test('native capture adapter converts local images to JPEG without leaking raw diagnostics', () => {
  const path = join(root, 'src/ai/image-capture.ts');
  assert.ok(existsSync(path), 'native image capture adapter must exist');

  const source = readFileSync(path, 'utf8');

  assert.match(source, /requestCameraPermissionsAsync/);
  assert.match(source, /requestMediaLibraryPermissionsAsync/);
  assert.match(source, /launchCameraAsync/);
  assert.match(source, /launchImageLibraryAsync/);
  assert.match(source, /ImageManipulator\.manipulate\(/);
  assert.match(source, /SaveFormat\.JPEG/);
  assert.match(source, /cleanupUnretainedGeneratedImages/);
  assert.match(source, /mediaTypes:\s*\[\s*['"]images['"]\s*\]/);
  assert.match(source, /allowsMultipleSelection:\s*false/);
  assert.match(source, /base64:\s*false/);
  assert.match(source, /exif:\s*false/);
  assert.match(source, /shouldDownloadFromNetwork:\s*false/);
  assert.match(
    source,
    /captureFromCamera[\s\S]*?try\s*\{[\s\S]*?requestCameraPermissionsAsync[\s\S]*?return await preparePickerResult/,
  );
  assert.match(
    source,
    /captureFromLibrary[\s\S]*?try\s*\{[\s\S]*?requestMediaLibraryPermissionsAsync[\s\S]*?return await preparePickerResult/,
  );

  assert.doesNotMatch(source, /manipulateAsync/);
  assert.doesNotMatch(source, /console\./);
  assert.doesNotMatch(source, /RAW_NATIVE_ERROR/);
});

test('generated JPEG cache cleanup is wired to replacement, removal, success and unmount', () => {
  const screen = readFileSync(join(root, 'src/app/(app)/ai/index.tsx'), 'utf8');
  const cache = readFileSync(join(root, 'src/ai/image-cache.ts'), 'utf8');

  assert.match(screen, /new PreparedImageCacheLifecycle\(deleteGeneratedImage\)/);
  assert.match(screen, /useEffect\(\(\) => \(\) => cacheLifecycleRef\.current\?\.clear\(\), \[\]\)/);
  assert.match(screen, /case 'ready':[\s\S]*?replacePrepared\(outcome\.image\)/);
  assert.match(screen, /function removeImage\(\)[\s\S]*?replacePrepared\(null\)/);
  assert.match(screen, /if \(result\.ok\)[\s\S]*?replacePrepared\(null\)/);
  assert.match(cache, /from ['"]expo-file-system['"]/);
  assert.match(cache, /Paths\.cache\.uri/);
  assert.match(cache, /file\.delete\(\)/);
  assert.doesNotMatch(cache, /console\.|deleteAsync|documentDirectory/);
});

test('authenticated layout exposes three focused tabs and keeps Tracker detail in a Stack', () => {
  const layoutPath = join(root, 'src/app/(app)/_layout.tsx');
  const trackerLayoutPath = join(root, 'src/app/(app)/bets/_layout.tsx');
  const layout = readFileSync(layoutPath, 'utf8');
  const trackerLayout = readFileSync(trackerLayoutPath, 'utf8');

  assert.match(layout, /<Tabs/);
  for (const route of ['home', 'ai', 'bets']) {
    assert.match(layout, new RegExp(`name=["']${route}["']`));
  }
  assert.match(layout, /tabBarAccessibilityLabel:\s*title/);
  for (const label of ['HOME', 'SCAN', 'TRACKER']) {
    assert.match(layout, new RegExp(`screen\\(['"]${label}['"]\\)`));
  }
  for (const route of ['stats', 'more']) {
    assert.match(layout, new RegExp(`name=["']${route}["'][\\s\\S]*?href:\\s*null`));
  }
  assert.match(layout, /tabBarItemStyle:\s*\{\s*minHeight:\s*52/);
  assert.match(layout, /name="index" options=\{\{ href: null \}\}/);

  assert.match(trackerLayout, /<Stack/);
  assert.match(trackerLayout, /name="index"/);
  assert.match(trackerLayout, /name="\[id\]"/);
  assert.match(trackerLayout, /name="new"/);
});

test('AI capture screen exposes secure scanner and responsive states', () => {
  const path = join(root, 'src/app/(app)/ai/index.tsx');
  assert.ok(existsSync(path), 'AI capture screen must exist');

  const source = readFileSync(path, 'utf8');

  for (const label of [
    'Scan screenshot',
    'Coupon',
    'Event',
    'Take photo',
    'Choose photo',
    'Replace',
    'Remove',
    'Analyze',
  ]) {
    assert.match(source, new RegExp(label));
  }

  for (const message of [
    'Analyzing coupon securely',
    'Coupon analysis is ready.',
    'Event analysis is not connected yet.',
    'You are offline',
    'Selection cancelled. Current image unchanged.',
    'Camera access is off.',
    'Photo access is off.',
    'This image could not be prepared.',
    'This image is too large to prepare safely.',
  ]) {
    assert.match(source, new RegExp(message.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }

  assert.match(source, /useNetworkState\(\)/);
  assert.match(source, /useRef\(false\)/);
  assert.match(source, /runWithCaptureLock\s*\(\s*operationLockRef/);
  assert.match(source, /accessibilityLabel="Coupon analysis result"/);
  assert.match(source, /NO FINANCIAL RECORD IS SAVED AUTOMATICALLY/);
  assert.match(source, /contentInsetAdjustmentBehavior="automatic"/);
  assert.match(source, /contentFit="contain"/);
  assert.match(source, /Linking\.openSettings\(\)/);
  assert.match(source, /accessibilityState=\{\{\s*selected:\s*mode === option\.value\s*\}\}/);
  assert.match(source, /minHeight:\s*(?:44|5[2-9]|[6-9]\d)/);
});
