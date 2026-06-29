import { getPrimaryEvent } from '@/lib/events/pulse'
import { getAmbientTheme } from '@/lib/events/pulse-themes'

export default function PulseThemeProvider() {
  const today = new Date().toISOString().slice(0, 10)
  const event = getPrimaryEvent(today)
  const tokens = getAmbientTheme(event?.theme ?? 'default')

  const lines = [
    `--accent: ${tokens.accent};`,
    `--accent-soft: ${tokens.accentSoft};`,
    `--accent-glow: ${tokens.accentGlow};`,
    `--bg: ${tokens.bg};`,
  ]

  if (tokens.texture) {
    lines.push(`--body-texture: ${tokens.texture};`)
  }
  if (tokens.textureSize) {
    lines.push(`--body-texture-size: ${tokens.textureSize};`)
  }

  const css = `:root { ${lines.join(' ')} }`

  return <style dangerouslySetInnerHTML={{ __html: css }} />
}
