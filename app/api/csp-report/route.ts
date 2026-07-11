import { NextRequest, NextResponse } from 'next/server'
import { canonicalClientIp, enforceRateLimit, RATE_LIMITS } from '@/lib/rate-limit'
import {
  CspBodyTooLargeError,
  CspReportParseError,
  MAX_CSP_REPORT_BODY_BYTES,
  parseCspReports,
  readBodyCapped,
} from '@/lib/security/csp-report'

const ACCEPTED_MEDIA_TYPES = new Set([
  'application/csp-report',
  'application/reports+json',
  'application/json',
])

function jsonError(status: number, error: string, headers?: HeadersInit) {
  return NextResponse.json({ success: false, error }, { status, headers })
}

function requestMediaType(req: NextRequest): string {
  return (req.headers.get('content-type') ?? '').split(';', 1)[0].trim().toLowerCase()
}

export async function POST(req: NextRequest) {
  const mediaType = requestMediaType(req)
  if (!ACCEPTED_MEDIA_TYPES.has(mediaType)) {
    return jsonError(415, 'Unsupported CSP report content type')
  }

  const contentLength = Number(req.headers.get('content-length'))
  if (Number.isFinite(contentLength) && contentLength > MAX_CSP_REPORT_BODY_BYTES) {
    return jsonError(413, 'CSP report body too large')
  }

  const ip = canonicalClientIp(
    req.headers.get('x-forwarded-for'),
    req.headers.get('x-real-ip'),
  )
  const limit = await enforceRateLimit(`csp-report:${ip}`, RATE_LIMITS.cspReport())

  if (limit.unavailable) {
    return jsonError(503, 'CSP report service temporarily unavailable')
  }
  if (!limit.allowed) {
    return jsonError(429, 'Too many CSP reports', {
      'Retry-After': String(limit.retryAfter || 60),
    })
  }

  let raw: string
  try {
    raw = await readBodyCapped(req)
  } catch (error) {
    if (error instanceof CspBodyTooLargeError) {
      return jsonError(413, 'CSP report body too large')
    }
    console.error('[CSP] body read failed')
    return jsonError(400, 'Invalid CSP report')
  }

  let payload: unknown
  try {
    payload = JSON.parse(raw)
  } catch {
    return jsonError(400, 'Invalid CSP report JSON')
  }

  try {
    const reports = parseCspReports(payload)
    for (const report of reports) {
      console.warn('[CSP] violation', JSON.stringify(report))
    }
  } catch (error) {
    if (!(error instanceof CspReportParseError)) {
      console.error('[CSP] report processing failed')
    }
    return jsonError(400, 'Invalid CSP report shape')
  }

  return new NextResponse(null, { status: 204 })
}
