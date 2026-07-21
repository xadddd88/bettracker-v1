import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        bn: {
          night: 'var(--night)',
          field: 'var(--field)',
          raised: 'var(--field-raised)',
          'border-subtle': 'var(--border-subtle)',
          'border-strong': 'var(--border-strong)',
          text: 'var(--text-primary)',
          muted: 'var(--text-muted)',
          quiet: 'var(--text-quiet)',
          data: 'var(--data-value)',
          signal: 'var(--signal)',
          'on-signal': 'var(--on-signal)',
          success: 'var(--success)',
          negative: 'var(--negative)',
          review: 'var(--review)',
        },
        // Existing utility names are adapters to the one semantic layer.
        night: {
          950: 'var(--night)',
          900: 'var(--field)',
          800: 'var(--field-raised)',
          700: 'var(--border-subtle)',
        },
        brand: {
          DEFAULT: 'var(--signal)',
          dark: 'var(--on-signal)',
        },
        tok: {
          bg: 'var(--night)',
          s1: 'var(--field)',
          s2: 'var(--field-raised)',
          border: 'var(--border-strong)',
          accent: 'var(--signal)',
          win: 'var(--success)',
          loss: 'var(--negative)',
          pending: 'var(--review)',
          neutral: 'var(--text-quiet)',
          t1: 'var(--text-primary)',
          t2: 'var(--text-muted)',
        },
      },
      borderRadius: {
        control: 'var(--radius-control)',
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        display: ['var(--font-space-grotesk)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-jetbrains-mono)', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
}

export default config
