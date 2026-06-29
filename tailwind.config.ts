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
          950: '#080b12',
          900: '#0e1420',
          800: '#141c2e',
          700: '#1c2538',
        },
        brand: {
          DEFAULT: '#3e7bfa',
          dark:    '#2563eb',
        },
      },
      fontFamily: {
        sans:    ['var(--font-geist)', '-apple-system', 'system-ui', 'sans-serif'],
        display: ['var(--font-geist)', '-apple-system', 'system-ui', 'sans-serif'],
        mono:    ['var(--font-geist-mono)', 'SF Mono', 'Menlo', 'monospace'],
        numbers: ['var(--font-geist-mono)', 'SF Mono', 'Menlo', 'monospace'],
      },
      letterSpacing: {
        'tight-xl': '-0.03em',
      },
    },
  },
  plugins: [],
}

export default config
