import { NextRequest, NextResponse } from 'next/server'

// Receives Content-Security-Policy-Report-Only violation reports from browsers.
// Violations are logged to Vercel runtime logs for observability.
// Switch next.config.ts header key to Content-Security-Policy to enforce.
export async function POST(req: NextRequest) {
  try {
    const body = JSON.parse(await req.text())
    const report = body['csp-report'] ?? body
    console.warn('[CSP] violation', JSON.stringify({
      directive: report['violated-directive'] ?? report['effective-directive'],
      blocked:   report['blocked-uri'],
      document:  report['document-uri'],
      script:    report['script-sample'],
    }))
  } catch {
    // malformed report body — ignore
  }
  return new NextResponse(null, { status: 204 })
}
