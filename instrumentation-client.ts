import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  tracesSampleRate: 1.0,

  // Sentry Logs
  _experiments: {
    enableLogs: true,
  },

  debug: false,
  // Session Replay is intentionally excluded
})

// Required for Sentry navigation tracing in App Router
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
