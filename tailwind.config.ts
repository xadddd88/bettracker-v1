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
      },
      fontFamily: {
        display: ['var(--font-space-grotesk)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-jetbrains-mono)', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
}

export default config
