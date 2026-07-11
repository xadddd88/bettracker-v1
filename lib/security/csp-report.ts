export const MAX_CSP_REPORT_BODY_BYTES = 32 * 1024
export const MAX_CSP_REPORTS = 20
export const MAX_CSP_REPORT_FIELD_LENGTH = 256

export class CspBodyTooLargeError extends Error {
  constructor() {
    super('CSP report body too large')
    this.name = 'CspBodyTooLargeError'
  }
}

export class CspReportParseError extends Error {
  constructor(message = 'Invalid CSP report') {
    super(message)
    this.name = 'CspReportParseError'
  }
}

export interface SanitizedCspReport {
  documentUri?: string
  referrer?: string
  blockedUri?: string
  violatedDirective?: string
  effectiveDirective?: string
  disposition?: string
  statusCode?: number
  sourceFile?: string
  lineNumber?: number
  columnNumber?: number
}

type UnknownRecord = Record<string, unknown>

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function boundedString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const normalized = value.replace(/[\u0000-\u001f\u007f]/g, '').trim()
  if (!normalized) return undefined
  return normalized.slice(0, MAX_CSP_REPORT_FIELD_LENGTH)
}

function boundedInteger(value: unknown): number | undefined {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  return Number.isInteger(n) && n >= 0 ? n : undefined
}

function sanitizeUrl(value: unknown): string | undefined {
  const raw = boundedString(value)
  if (!raw) return undefined

  const lower = raw.toLowerCase()
  if (lower === 'inline' || lower === 'eval' || lower === 'self') return `[${lower}]`
  if (lower.startsWith('data:')) return '[data]'
  if (lower.startsWith('blob:')) return '[blob]'

  if (raw.startsWith('/')) {
    return raw.split(/[?#]/, 1)[0].slice(0, MAX_CSP_REPORT_FIELD_LENGTH) || '/'
  }

  try {
    const url = new URL(raw)
    if (!['http:', 'https:', 'ws:', 'wss:'].includes(url.protocol)) return '[unsupported-url]'
    url.username = ''
    url.password = ''
    url.search = ''
    url.hash = ''
    return url.toString().slice(0, MAX_CSP_REPORT_FIELD_LENGTH)
  } catch {
    return '[invalid-url]'
  }
}

function compactReport(report: SanitizedCspReport): SanitizedCspReport {
  return Object.fromEntries(
    Object.entries(report).filter(([, value]) => value !== undefined)
  ) as SanitizedCspReport
}

function sanitizeLegacyBody(body: UnknownRecord): SanitizedCspReport {
  return compactReport({
    documentUri: sanitizeUrl(body['document-uri']),
    referrer: sanitizeUrl(body.referrer),
    blockedUri: sanitizeUrl(body['blocked-uri']),
    violatedDirective: boundedString(body['violated-directive']),
    effectiveDirective: boundedString(body['effective-directive']),
    disposition: boundedString(body.disposition),
    statusCode: boundedInteger(body['status-code']),
    sourceFile: sanitizeUrl(body['source-file']),
    lineNumber: boundedInteger(body['line-number']),
    columnNumber: boundedInteger(body['column-number']),
  })
}

function sanitizeReportingBody(body: UnknownRecord): SanitizedCspReport {
  return compactReport({
    documentUri: sanitizeUrl(body.documentURL ?? body['document-uri']),
    referrer: sanitizeUrl(body.referrer),
    blockedUri: sanitizeUrl(body.blockedURL ?? body['blocked-uri']),
    violatedDirective: boundedString(body.violatedDirective ?? body['violated-directive']),
    effectiveDirective: boundedString(body.effectiveDirective ?? body['effective-directive']),
    disposition: boundedString(body.disposition),
    statusCode: boundedInteger(body.statusCode ?? body['status-code']),
    sourceFile: sanitizeUrl(body.sourceFile ?? body['source-file']),
    lineNumber: boundedInteger(body.lineNumber ?? body['line-number']),
    columnNumber: boundedInteger(body.columnNumber ?? body['column-number']),
  })
}

export function parseCspReports(payload: unknown): SanitizedCspReport[] {
  if (Array.isArray(payload)) {
    const reports: SanitizedCspReport[] = []
    for (const entry of payload.slice(0, MAX_CSP_REPORTS)) {
      if (!isRecord(entry) || entry.type !== 'csp-violation' || !isRecord(entry.body)) continue
      reports.push(sanitizeReportingBody(entry.body))
    }
    if (reports.length === 0) throw new CspReportParseError()
    return reports
  }

  if (!isRecord(payload) || !isRecord(payload['csp-report'])) {
    throw new CspReportParseError()
  }

  return [sanitizeLegacyBody(payload['csp-report'])]
}

export async function readBodyCapped(
  request: Request,
  maxBytes = MAX_CSP_REPORT_BODY_BYTES,
): Promise<string> {
  if (!request.body) return ''

  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (!value) continue

    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined)
      throw new CspBodyTooLargeError()
    }
    chunks.push(value)
  }

  const combined = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    combined.set(chunk, offset)
    offset += chunk.byteLength
  }

  return new TextDecoder().decode(combined)
}
