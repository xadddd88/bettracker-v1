import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const tokens = JSON.parse(readFileSync(join(root, 'design-system/broadcast-noir.v3.1.json'), 'utf8'))
const css = readFileSync(join(root, 'app/globals.css'), 'utf8')
const mobileTheme = readFileSync(join(root, 'apps/mobile/src/ui/theme.ts'), 'utf8')
const webPrimitives = readFileSync(join(root, 'components/ui/BroadcastNoir.tsx'), 'utf8')
const mobilePrimitives = readFileSync(join(root, 'apps/mobile/src/ui/broadcast-noir-primitives.tsx'), 'utf8')

assert.equal(tokens.name, 'Broadcast Noir')
assert.equal(tokens.version, '3.1.0')

const cssNames = {
  night: 'night',
  field: 'field',
  fieldRaised: 'field-raised',
  borderSubtle: 'border-subtle',
  borderStrong: 'border-strong',
  textPrimary: 'text-primary',
  textMuted: 'text-muted',
  textQuiet: 'text-quiet',
  textQuietRaised: 'text-quiet-raised',
  dataValue: 'data-value',
  signal: 'signal',
  onSignal: 'on-signal',
  success: 'success',
  negative: 'negative',
  review: 'review',
}

for (const [tokenName, cssName] of Object.entries(cssNames)) {
  const match = css.match(new RegExp(`--${cssName}:\\s*(#[0-9A-Fa-f]{6});`))
  assert.ok(match, `missing CSS semantic variable --${cssName}`)
  assert.equal(match[1].toUpperCase(), tokens.colors[tokenName], `CSS parity: ${tokenName}`)
}

const semanticBlock = mobileTheme.match(/export const semanticColors = \{([\s\S]*?)\n\} as const;/)
assert.ok(semanticBlock, 'mobile semanticColors block missing')
const mobileColors = Object.fromEntries(
  [...semanticBlock[1].matchAll(/^\s+(\w+):\s+'(#[0-9A-Fa-f]{6})',$/gm)]
    .map((match) => [match[1], match[2].toUpperCase()]),
)
assert.deepEqual(mobileColors, tokens.colors, 'mobile semantic color parity')

function luminance(hex) {
  const channels = hex.slice(1).match(/../g).map((value) => parseInt(value, 16) / 255)
  const linear = channels.map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]
}

function contrast(foreground, background) {
  const a = luminance(foreground)
  const b = luminance(background)
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

const contrastMatrix = [
  ['textPrimary', 'night', 4.5],
  ['textPrimary', 'field', 4.5],
  ['textMuted', 'field', 4.5],
  ['textQuiet', 'field', 4.5],
  ['textQuietRaised', 'fieldRaised', 4.5],
  ['borderStrong', 'field', 3],
  ['onSignal', 'signal', 4.5],
  ['dataValue', 'field', 4.5],
  ['success', 'field', 4.5],
  ['negative', 'field', 4.5],
  ['review', 'field', 4.5],
]

for (const [foreground, background, minimum] of contrastMatrix) {
  const ratio = contrast(tokens.colors[foreground], tokens.colors[background])
  assert.ok(ratio >= minimum, `${foreground}/${background} contrast ${ratio.toFixed(2)} < ${minimum}`)
}

assert.deepEqual(
  Object.keys(tokens.colors).filter((name) => name.startsWith('border')).sort(),
  ['borderStrong', 'borderSubtle'],
  'neutral boundaries must use only the documented border tokens',
)
assert.notEqual(tokens.colors.signal, tokens.colors.success, 'signal and success must remain distinct')
assert.notEqual(tokens.colors.dataValue, tokens.colors.review, 'odds/data cannot use review semantics')
assert.equal(tokens.geometry.webTouchMinimum, 44)
assert.equal(tokens.geometry.iosTouchMinimum, 44)
assert.equal(tokens.geometry.androidTouchMinimum, 48)
assert.ok(tokens.typography.metadataCompact.fontSize >= 11)
assert.equal(tokens.motion.infiniteDecorativeLoops, false)
assert.doesNotMatch(css, /animation\s*:[^;]*\binfinite\b/i)
assert.doesNotMatch(css, /(?:linear|radial|conic)-gradient\s*\(/i)

for (const source of [webPrimitives, mobilePrimitives]) {
  assert.match(source, /success[^\n]*['"]✓['"]/)
  assert.match(source, /review[^\n]*['"]!['"]/)
  assert.match(source, /negative[^\n]*['"]×['"]/)
  assert.match(source, /dataValue|bn-data-value/)
}
assert.match(webPrimitives, /data-status=\{status\}/)
assert.match(mobilePrimitives, /accessibilityLabel=\{`\$\{status\}: \$\{label\}`\}/)
assert.match(mobilePrimitives, /Platform\.select/)

function tsxFilesUnder(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return tsxFilesUnder(path)
    return entry.isFile() && entry.name.endsWith('.tsx') ? [path] : []
  })
}

const hardcodedHex = /(?:["'`:]\s*)#[0-9A-Fa-f]{3,8}\b/g
for (const path of tsxFilesUnder(join(root, 'app'))) {
  const source = readFileSync(path, 'utf8')
  assert.doesNotMatch(source, hardcodedHex, `${path} must consume semantic design tokens instead of hardcoded hex colors`)
}

const aiPage = readFileSync(join(root, 'app/(app)/ai/page.tsx'), 'utf8')
assert.match(aiPage, /broadcastNoirColors/, 'standalone Analyst report must source colors from the Broadcast Noir adapter')
assert.match(aiPage, /var\(--bn-data-value\)/, 'standalone Analyst report must expose semantic CSS variables')
assert.match(aiPage, /@media print\{[\s\S]*-webkit-print-color-adjust:exact;print-color-adjust:exact/, 'standalone Analyst report must preserve semantic print colors when browser background graphics are disabled')
assert.match(aiPage, /break-inside:avoid;page-break-inside:avoid/, 'standalone Analyst report must keep bounded report sections together across printed pages')

console.log(`Broadcast Noir v${tokens.version}: parity, contrast and semantic-form gates passed`)
