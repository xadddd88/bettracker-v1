import { getPrimaryEvent } from '@/lib/events/pulse'
import { getAmbientTheme } from '@/lib/events/pulse-themes'

export default function PulseThemeProvider() {
  const today = new Date().toISOString().slice(0, 10)
  const event = getPrimaryEvent(today)
  const t = getAmbientTheme(event?.theme ?? 'default')

  const vars: string[] = [
    `--accent: ${t.accent};`,
    `--accent-soft: ${t.accentSoft};`,
    `--accent-glow: ${t.accentGlow};`,
    `--accent-rail: ${t.accentRail};`,
    `--bg: ${t.bg};`,
  ]

  if (t.surface1)    vars.push(`--surface-1: ${t.surface1};`)
  if (t.surface2)    vars.push(`--surface-2: ${t.surface2};`)
  if (t.bodyOverlay) vars.push(`--body-overlay: ${t.bodyOverlay};`)
  if (t.texture)     vars.push(`--body-texture: ${t.texture};`)
  if (t.textureSize) vars.push(`--body-texture-size: ${t.textureSize};`)

  return <style dangerouslySetInnerHTML={{ __html: `:root { ${vars.join(' ')} }` }} />
}
