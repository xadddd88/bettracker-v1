#!/usr/bin/env node

import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = file => readFileSync(path.join(repoRoot, file), 'utf8')

function hrefsIn(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker)
  const end = source.indexOf(endMarker, start + startMarker.length)
  assert.ok(start >= 0 && end > start, `missing route block ${startMarker}`)
  return [...source.slice(start, end).matchAll(/href:\s*'([^']+)'/g)].map(match => match[1])
}

const appLayout = read('app/(app)/layout.tsx')
const appHeader = read('components/ui/AppHeader.tsx')
const mobileNav = read('components/ui/MobileNav.tsx')
const loginPage = read('app/(auth)/login/page.tsx')

assert.match(appLayout, /import AppHeader from '@\/components\/ui\/AppHeader'/)
assert.doesNotMatch(appLayout, /Sidebar/)
assert.match(appLayout, /<AppHeader user=\{user\}/)
assert.match(appLayout, /max-w-\[1600px\]/)

assert.deepEqual(hrefsIn(appHeader, 'const PRIMARY_NAV', 'const SECONDARY_NAV'), [
  '/dashboard',
  '/ai',
  '/bets',
  '/analytics',
])
assert.deepEqual(hrefsIn(appHeader, 'const SECONDARY_NAV', 'export default'), [
  '/decisions',
  '/scout',
  '/coach',
  '/bankroll',
  '/settings',
])
assert.match(appHeader, /aria-label="Primary navigation"/)
assert.match(appHeader, /aria-current=\{active \? 'page'/)
assert.match(appHeader, /BetTracker/)
assert.match(appHeader, /var\(--signal\)/)

assert.deepEqual(hrefsIn(mobileNav, 'const NAV', 'const MORE_LINKS'), [
  '/dashboard',
  '/ai',
  '/bets',
  '/analytics',
])
assert.deepEqual(hrefsIn(mobileNav, 'const MORE_LINKS', 'const MORE_ROUTES'), [
  '/decisions',
  '/scout',
  '/coach',
  '/bankroll',
  '/settings',
])
assert.match(mobileNav, /paddingBottom:\s*'env\(safe-area-inset-bottom\)'/)
assert.match(mobileNav, /bg-\[var\(--signal\)\] text-\[var\(--on-signal\)\]/)

assert.match(loginPage, /<div className="min-w-0">\s*<p className="editorial-kicker">Access \/ BetTracker<\/p>/)
assert.match(loginPage, /text-\[clamp\(2\.7rem,4\.8vw,4rem\)\]/)
assert.doesNotMatch(loginPage, /text-\[clamp\(2\.7rem,6vw,5rem\)\]/)

const mobileTabs = read('apps/mobile/src/app/(app)/_layout.tsx')
const tabNames = [...mobileTabs.matchAll(/<Tabs\.Screen name="([^"]+)"/g)].map(match => match[1])
assert.deepEqual(tabNames, ['home', 'ai', 'bets', 'stats', 'more', 'index'])
assert.match(mobileTabs, /tabBarActiveBackgroundColor:\s*semanticColors\.signal/)
assert.match(mobileTabs, /tabBarActiveTintColor:\s*semanticColors\.onSignal/)
assert.match(mobileTabs, /Platform\.OS === 'android' \? 48 : 44/)
assert.doesNotMatch(mobileTabs, /useSafeAreaInsets/)
for (const hiddenRoute of ['stats', 'more', 'index']) {
  assert.match(mobileTabs, new RegExp(`name=["']${hiddenRoute}["'][\\s\\S]*?href:\\s*null`))
}

const appConfig = JSON.parse(read('apps/mobile/app.json'))
assert.equal(appConfig.expo.name, 'BetTracker')
assert.equal(appConfig.expo.backgroundColor, '#070A08')
assert.equal(appConfig.expo.primaryColor, '#BFFF3B')
assert.equal(appConfig.expo.android.predictiveBackGestureEnabled, true)
assert.equal(appConfig.expo.android.adaptiveIcon.backgroundColor, '#070A08')

// Stable native/runtime identity is deliberately outside the visual rename.
assert.equal(appConfig.expo.slug, 'xaddd')
assert.equal(appConfig.expo.scheme, 'xaddd')
assert.equal(appConfig.expo.ios.bundleIdentifier, 'com.dmitriykhodakivskyi.xaddd')
assert.equal(appConfig.expo.android.package, 'com.dmitriykhodakivskyi.xaddd')
assert.equal(appConfig.expo.extra.eas.projectId, 'b830dceb-1f96-4c09-b02d-fd2415c14a02')

const splashPlugin = appConfig.expo.plugins.find(plugin => Array.isArray(plugin) && plugin[0] === 'expo-splash-screen')
assert.ok(splashPlugin)
assert.equal(splashPlugin[1].backgroundColor, '#070A08')
assert.equal(splashPlugin[1].image, './assets/brand/bettracker-splash-mark.png')

for (const asset of [
  appConfig.expo.icon,
  appConfig.expo.android.adaptiveIcon.foregroundImage,
  appConfig.expo.android.adaptiveIcon.monochromeImage,
  appConfig.expo.web.favicon,
  splashPlugin[1].image,
]) {
  assert.equal(existsSync(path.join(repoRoot, 'apps/mobile', asset)), true, `${asset} must exist`)
}

for (const visibleSurface of [
  'app/layout.tsx',
  'app/(auth)/login/page.tsx',
  'app/(app)/dashboard/page.tsx',
  'components/ui/AppHeader.tsx',
  'components/ui/MobileNav.tsx',
  'apps/mobile/src/app/sign-in.tsx',
  'apps/mobile/src/app/(app)/home.tsx',
  'apps/mobile/src/app/(app)/ai/index.tsx',
  'apps/mobile/src/app/(app)/bets/index.tsx',
  'apps/mobile/src/app/(app)/more.tsx',
]) {
  assert.doesNotMatch(read(visibleSurface), /XADDD/i, `${visibleSurface} retains the retired visible brand`)
}

console.log('Broadcast Noir PR B: shell, routes, brand assets, safe-area and native config gates passed')
