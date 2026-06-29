import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        night: {
          950: '#070D1B',
          900: '#0C1424',
          800: '#132033',
          700: '#1D2F4A',
        },
        brand: {
          DEFAULT: '#F59E0B',
          dark: '#D97706',
        },
        tok: {
          bg:      'var(--bg)',
          s1:      'var(--surface-1)',
          s2:      'var(--surface-2)',
          border:  'var(--border)',
          accent:  'var(--accent)',
          win:     'var(--win)',
          loss:    'var(--loss)',
          pending: 'var(--pending)',
          neutral: 'var(--neutral)',
          t1:      'var(--text-1)',
          t2:      'var(--text-2)',
        },
      },
      fontFamily: {
        sans:    ['var(--font-inter)', 'system-ui', 'sans-serif'],
        display: ['var(--font-space-grotesk)', 'system-ui', 'sans-serif'],
        mono:    ['var(--font-jetbrains-mono)', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
}

export default config
