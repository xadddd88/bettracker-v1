'use client'

import * as Sentry from '@sentry/nextjs'

export default function SentryExamplePage() {
  return (
    <main style={{ padding: '2rem', fontFamily: 'monospace' }}>
      <h1>Sentry Example</h1>
      <p style={{ color: '#888', marginBottom: '1.5rem' }}>
        This page is for verifying Sentry error monitoring. Remove or gate it before production.
      </p>
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
        <button
          style={btnStyle('#ef4444')}
          onClick={() => {
            throw new Error('[BetTracker] Sentry test — client-side error')
          }}
        >
          Throw client error
        </button>

        <button
          style={btnStyle('#6366f1')}
          onClick={async () => {
            const res = await fetch('/api/sentry-example-api')
            const data = await res.json()
            alert(JSON.stringify(data))
          }}
        >
          Trigger server error
        </button>

        <button
          style={btnStyle('#f59e0b')}
          onClick={() => {
            Sentry.captureMessage('[BetTracker] Sentry test — manual capture', 'info')
            alert('Sentry.captureMessage sent — check your Sentry Issues.')
          }}
        >
          Send manual capture
        </button>
      </div>
    </main>
  )
}

function btnStyle(bg: string) {
  return {
    background: bg,
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    padding: '10px 20px',
    cursor: 'pointer',
    fontSize: '14px',
  } as const
}
