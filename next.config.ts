import { withSentryConfig } from '@sentry/nextjs'
import type { NextConfig } from 'next'

const supabaseOrigin = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const posthogOrigin  = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://eu.i.posthog.com'

// Decision #054 Phase A: CSP remains Report-Only. This phase hardens the
// reporting endpoint and baseline headers without enabling enforcement or
// removing unsafe-inline. Nonce/hash enforcement requires a later review.
const cspDirectives = [
  "default-src 'self'",
  // Next.js App Router injects inline hydration/streaming scripts
  "script-src 'self' 'unsafe-inline'",
  // Tailwind and Next.js inject critical CSS inline
  "style-src 'self' 'unsafe-inline'",
  // Fonts are self-hosted by next/font at build time — no external CDN at runtime
  "font-src 'self'",
  // data: for base64 images; blob: for Next.js image optimisation
  "img-src 'self' data: blob:",
  // Supabase REST+auth (https) and Realtime (wss); PostHog analytics events.
  // Sentry is tunnelled through /monitoring (same-origin) — no external entry needed.
  [
    "connect-src 'self'",
    supabaseOrigin,
    supabaseOrigin.replace(/^https/, 'wss'),
    posthogOrigin,
  ].filter(Boolean).join(' '),
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  "report-uri /api/csp-report",
].join('; ')

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key:   'Content-Security-Policy-Report-Only',
            value: cspDirectives,
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
          },
        ],
      },
    ]
  },
}

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,

  silent: !process.env.CI,

  widenClientFileUpload: true,

  // Proxy Sentry requests through Next.js to avoid ad blockers
  tunnelRoute: '/monitoring',

  // Delete source maps from client bundle after uploading to Sentry
  sourcemaps: {
    filesToDeleteAfterUpload: ['.next/static/**/*.map'],
  },

  webpack: {
    reactComponentAnnotation: { enabled: true },
    treeshake: { removeDebugLogging: true },
    automaticVercelMonitors: true,
  },
})
