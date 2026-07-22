import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const source = (file) => readFileSync(path.join(root, file), 'utf8')

function filesUnder(directory, extensions) {
  const absolute = path.join(root, directory)
  return readdirSync(absolute, { withFileTypes: true }).flatMap((entry) => {
    const relative = path.join(directory, entry.name)
    if (entry.isDirectory()) return filesUnder(relative, extensions)
    return extensions.some((extension) => entry.name.endsWith(extension)) ? [relative] : []
  })
}

const webRoutes = [
  'app/(app)/ai/page.tsx',
  'app/(app)/analytics/page.tsx',
  'app/(app)/bankroll/page.tsx',
  'app/(app)/bets/[id]/page.tsx',
  'app/(app)/bets/new/page.tsx',
  'app/(app)/bets/page.tsx',
  'app/(app)/coach/page.tsx',
  'app/(app)/dashboard/page.tsx',
  'app/(app)/decisions/[id]/page.tsx',
  'app/(app)/decisions/page.tsx',
  'app/(app)/scout/page.tsx',
  'app/(app)/settings/page.tsx',
  'app/(auth)/login/page.tsx',
  'app/auth/set-password/page.tsx',
  'app/page.tsx',
]

const mobileRoutes = [
  'apps/mobile/src/app/(app)/_layout.tsx',
  'apps/mobile/src/app/(app)/ai/index.tsx',
  'apps/mobile/src/app/(app)/bets/[id].tsx',
  'apps/mobile/src/app/(app)/bets/_layout.tsx',
  'apps/mobile/src/app/(app)/bets/index.tsx',
  'apps/mobile/src/app/(app)/bets/new.tsx',
  'apps/mobile/src/app/(app)/home.tsx',
  'apps/mobile/src/app/(app)/index.tsx',
  'apps/mobile/src/app/(app)/more.tsx',
  'apps/mobile/src/app/(app)/stats.tsx',
  'apps/mobile/src/app/_layout.tsx',
  'apps/mobile/src/app/sign-in.tsx',
]

for (const file of [...webRoutes, ...mobileRoutes]) {
  assert.equal(existsSync(path.join(root, file)), true, `${file} is missing from the route inventory`)
}

for (const file of webRoutes.filter((file) => file !== 'app/page.tsx')) {
  assert.match(source(file), /(?:Broadcast(?:Button|DataValue|Panel|Status)|\bbn-(?:button|data-value|page|panel|status)\b)/, `${file} is outside Broadcast Noir`)
}

for (const file of mobileRoutes.filter((file) => !file.endsWith('/index.tsx') && !file.endsWith('/_layout.tsx'))) {
  assert.match(source(file), /(?:Broadcast(?:Button|Panel|Status)|semanticColors)/, `${file} is outside Broadcast Noir`)
}

const runtimeFiles = [
  ...filesUnder('app', ['.css', '.ts', '.tsx']),
  ...filesUnder('components', ['.ts', '.tsx']),
  ...filesUnder('apps/mobile/src', ['.ts', '.tsx']),
]
const runtime = runtimeFiles.map((file) => `${file}\n${source(file)}`).join('\n')

assert.doesNotMatch(runtime, /(?:text|bg|border)-(?:gray|slate|amber|green|red|yellow|purple|blue|indigo|orange)(?:-|\b)|bg-black|text-white|border-black/)
assert.doesNotMatch(runtime, /#e8ff00|#E8FF00|editorial-ticker|TimeWarpBackdrop|EditorialBackdrop|WarpRail|KineticType/)
assert.doesNotMatch(runtime, /animate-(?:spin|pulse|bounce)|withRepeat\s*\(/, 'Infinite runtime motion is forbidden')

const globals = source('app/globals.css')
const theme = source('apps/mobile/src/ui/theme.ts')
const webPrimitives = source('components/ui/BroadcastNoir.tsx')
const mobilePrimitives = source('apps/mobile/src/ui/broadcast-noir-primitives.tsx')

assert.doesNotMatch(globals, /\.web-editorial\s+\.(?:text|bg|border)-/, 'Legacy Web utility adapter survived')
assert.doesNotMatch(globals, /gradient\s*\(/i)
assert.doesNotMatch(theme, /export const colors\s*=/, 'Second native theme alias survived')
assert.match(webPrimitives, /aria-label=\{ariaLabel \?\? \(typeof children === 'string' \? `\$\{status\}: \$\{children\}` : status\)\}/)
assert.match(mobilePrimitives, /accessibilityLabel=\{`\$\{status\}: \$\{label\}`\}/)

for (const removed of [
  'apps/mobile/src/ui/time-warp.tsx',
  'components/pulse/EventPulseCard.tsx',
  'components/pulse/PulseEventHeader.tsx',
  'components/pulse/PulseThemeProvider.tsx',
  'lib/events/pulse-themes.ts',
]) {
  assert.equal(existsSync(path.join(root, removed)), false, `${removed} must stay removed`)
}

for (const file of [
  'app/(app)/bankroll/BankrollView.tsx',
  'app/(app)/coach/CoachView.tsx',
  'app/(app)/scout/ScoutForm.tsx',
  'app/(app)/settings/SettingsForm.tsx',
  'components/feedback/FeedbackWidget.tsx',
  'components/onboarding/OnboardingCard.tsx',
  'components/risk/RiskEvaluator.tsx',
]) {
  assert.match(source(file), /Broadcast(?:Button|DataValue|Panel|Status)/, `${file} bypasses Broadcast Noir primitives`)
}

console.log(`Broadcast Noir rollout gate: PASS · ${webRoutes.length} Web routes · ${mobileRoutes.length} mobile routes`)
