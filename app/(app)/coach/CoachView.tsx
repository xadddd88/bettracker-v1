'use client'

import { useState, useCallback } from 'react'
import Link from 'next/link'
import type { CoachingSession, CalibrationGrade, CoachRecommendation } from '@/types'
import { BroadcastButton, BroadcastPanel, BroadcastStatus } from '@/components/ui/BroadcastNoir'
import type { BroadcastNoirStatus } from '@/lib/ui/broadcast-noir'

type PeriodDays = 7 | 30 | 90 | 0

const PERIODS: { value: PeriodDays; label: string }[] = [
  { value: 7,  label: '7 days' },
  { value: 30, label: '30 days' },
  { value: 90, label: '90 days' },
  { value: 0,  label: 'All time' },
]

function periodLabel(days: number): string {
  if (days === 0) return 'All time'
  return `Last ${days} days`
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

// ─── Calibration grade badge ──────────────────────────────────
function CalibrationBadge({ grade }: { grade?: CalibrationGrade | null }) {
  if (!grade) return null
  const config: Record<CalibrationGrade, { label: string; status: BroadcastNoirStatus }> = {
    excellent: { label: 'Excellent calibration', status: 'success' },
    good:      { label: 'Good calibration', status: 'success' },
    fair:      { label: 'Fair calibration', status: 'review' },
    poor:      { label: 'Poor calibration', status: 'negative' },
  }
  const c = config[grade]
  return (
    <BroadcastStatus className="shrink-0" status={c.status}>{c.label}</BroadcastStatus>
  )
}

// ─── Recommendation card ──────────────────────────────────────
function RecommendationCard({
  rec, recKey, expanded, onToggle,
}: {
  rec: CoachRecommendation
  recKey: string
  expanded: boolean
  onToggle: (key: string) => void
}) {
  const priorityStatus = ({
    high: 'negative',
    medium: 'review',
    low: 'neutral',
  } satisfies Record<CoachRecommendation['priority'], BroadcastNoirStatus>)[rec.priority]

  return (
    <div className="flex flex-col gap-1.5 rounded-control border border-bn-border-subtle bg-bn-raised px-3 py-2.5">
      <div className="flex items-start justify-between gap-2">
        <span className="flex-1 text-sm font-medium text-bn-text">{rec.action}</span>
        <BroadcastStatus className="shrink-0" status={priorityStatus}>{rec.priority}</BroadcastStatus>
      </div>
      {expanded && (
        <p className="text-xs leading-relaxed text-bn-muted">{rec.detail}</p>
      )}
      <button
        onClick={() => onToggle(recKey)}
        className="min-h-11 text-left text-xs font-bold text-bn-text underline underline-offset-4"
      >
        {expanded ? 'Hide detail' : 'Show detail'}
      </button>
    </div>
  )
}

// ─── Full session display ─────────────────────────────────────
function SessionCard({
  session, expandedRecs, onToggleRec,
}: {
  session: CoachingSession
  expandedRecs: Set<string>
  onToggleRec: (key: string) => void
}) {
  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-2">
        <div className="flex flex-wrap items-center gap-2 text-xs text-bn-muted">
          <span>{periodLabel(session.period_days)}</span>
          <span className="text-bn-quiet">·</span>
          <span>{formatDate(session.created_at)}</span>
          <span className="text-bn-quiet">·</span>
          <span>{session.bets_analysed} bets analysed</span>
        </div>
        <CalibrationBadge grade={session.calibration_grade} />
      </div>
      {session.calibration_grade && (
        <p className="-mt-2 text-[10px] text-bn-muted">Calibration: how well your confidence predictions matched your actual results.</p>
      )}

      {/* Summary */}
      <p className="text-sm leading-relaxed text-bn-text">{session.summary}</p>

      {/* Strengths */}
      {session.strengths.length > 0 && (
        <div>
          <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-bn-success">Strengths</p>
          <ul className="flex flex-col gap-1.5">
            {session.strengths.map((s, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-bn-text">
                <span className="mt-0.5 shrink-0 text-bn-success" aria-hidden>&#10003;</span>
                {s}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Weaknesses */}
      {session.weaknesses.length > 0 && (
        <div>
          <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-bn-review">Areas to improve</p>
          <ul className="flex flex-col gap-1.5">
            {session.weaknesses.map((w, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-bn-text">
                <span className="mt-0.5 shrink-0 text-bn-review" aria-hidden>&#9888;</span>
                {w}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Recommendations */}
      {session.recommendations.length > 0 && (
        <div>
          <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-bn-text">Recommendations</p>
          <div className="flex flex-col gap-2">
            {session.recommendations.map((rec, i) => (
              <RecommendationCard
                key={i}
                rec={rec}
                recKey={`${session.id}-${i}`}
                expanded={expandedRecs.has(`${session.id}-${i}`)}
                onToggle={onToggleRec}
              />
            ))}
          </div>
        </div>
      )}

      {/* Disclaimer */}
      <p className="rounded-control border border-bn-border-subtle px-3 py-2 text-[11px] leading-relaxed text-bn-muted">
        &#9888; {session.disclaimer ?? 'Past performance does not predict future results. This analysis is retrospective and does not constitute financial advice.'}
      </p>
    </div>
  )
}

// ─── Main CoachView ───────────────────────────────────────────
interface CoachViewProps {
  initialSessions: CoachingSession[]
  settledBetsCount: number
}

export default function CoachView({ initialSessions, settledBetsCount }: CoachViewProps) {
  const [sessions, setSessions] = useState<CoachingSession[]>(initialSessions)
  const [periodDays, setPeriodDays] = useState<PeriodDays>(30)
  const [focusNotes, setFocusNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [expandedSessions, setExpandedSessions] = useState<Set<string>>(new Set())
  const [expandedRecs, setExpandedRecs] = useState<Set<string>>(new Set())

  const canRun = settledBetsCount >= 5

  const handleCoach = useCallback(async () => {
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/coach', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          period_days: periodDays,
          focus_notes: focusNotes.trim() || undefined,
        }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        setError(json.error ?? 'Coach failed. Please try again.')
        return
      }
      setSessions(prev => [json.data as CoachingSession, ...prev])
    } catch {
      setError('Network error — please try again.')
    } finally {
      setLoading(false)
    }
  }, [periodDays, focusNotes])

  const toggleSession = useCallback((id: string) => {
    setExpandedSessions(prev => {
      const next = new Set(prev)
      if (next.has(id)) { next.delete(id) } else { next.add(id) }
      return next
    })
  }, [])

  const toggleRec = useCallback((key: string) => {
    setExpandedRecs(prev => {
      const next = new Set(prev)
      if (next.has(key)) { next.delete(key) } else { next.add(key) }
      return next
    })
  }, [])

  const latestSession  = sessions[0] ?? null
  const pastSessions   = sessions.slice(1)

  return (
    <div className="flex flex-col gap-6">
      {/* ── Run Coach form ──────────────────────────────────── */}
      <BroadcastPanel className="flex flex-col gap-4 p-4 sm:p-5">
        {/* Period selector */}
        <div>
          <label className="label mb-2">Period</label>
          <div className="flex gap-2">
            {PERIODS.map(p => (
              <BroadcastButton
                key={p.value}
                onClick={() => setPeriodDays(p.value)}
                disabled={!canRun}
                aria-pressed={periodDays === p.value}
                className="flex-1"
                tone={periodDays === p.value ? 'primary' : 'secondary'}
              >
                {p.label}
              </BroadcastButton>
            ))}
          </div>
          <p className="mt-1.5 text-[11px] text-bn-muted">Limits the AI to settled bets within this window — narrower periods show recent trends.</p>
        </div>

        {/* Focus notes */}
        <div>
          <label className="label">Focus notes <span className="font-normal text-bn-quiet">(optional)</span></label>
          <textarea
            className="input resize-none mt-1"
            rows={2}
            maxLength={500}
            placeholder="What do you want to focus on? e.g. I think I'm overbet on soccer parlays…"
            value={focusNotes}
            onChange={e => setFocusNotes(e.target.value)}
            disabled={!canRun || loading}
          />
          {focusNotes.length > 400 && (
            <p className="mt-0.5 text-right text-[11px] text-bn-muted">{focusNotes.length}/500</p>
          )}
        </div>

        {/* Gate message */}
        {!canRun && (
          <BroadcastStatus className="w-full" status="review">Add at least 5 settled bets first.</BroadcastStatus>
        )}

        {/* Error */}
        {error && (
          <BroadcastStatus className="w-full" status="negative">{error}</BroadcastStatus>
        )}

        <BroadcastButton
          onClick={handleCoach}
          disabled={loading || !canRun}
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              Analysing…
            </span>
          ) : '🧠 Get coaching'}
        </BroadcastButton>
      </BroadcastPanel>

      {/* ── Latest session ──────────────────────────────────── */}
      {latestSession ? (
        <BroadcastPanel className="p-4 sm:p-5">
          <SessionCard
            session={latestSession}
            expandedRecs={expandedRecs}
            onToggleRec={toggleRec}
          />
        </BroadcastPanel>
      ) : (
        <BroadcastPanel className="flex flex-col items-center gap-3 py-10 text-center">
          <BroadcastStatus status="neutral">Empty</BroadcastStatus>
          <p className="text-sm font-medium text-bn-text">No coaching sessions yet</p>
          <p className="text-xs text-bn-muted">
            {canRun
              ? 'Run Coach to get your first performance analysis.'
              : "Run Coach after you've settled at least 5 bets."}
          </p>
        </BroadcastPanel>
      )}

      {/* ── Next-step CTA ──────────────────────────────────── */}
      {latestSession && (
        <div className="flex items-center justify-between px-1">
          <p className="text-xs text-bn-muted">Apply these insights in your next analysis.</p>
          <Link href="/ai" className="shrink-0 text-xs font-bold text-bn-text underline underline-offset-4">→ AI Analyst</Link>
        </div>
      )}

      {/* ── Past sessions ───────────────────────────────────── */}
      {pastSessions.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-bn-quiet">Past sessions</p>
          {pastSessions.map(s => {
            const isExpanded = expandedSessions.has(s.id)
            return (
              <BroadcastPanel key={s.id} className="p-4 sm:p-5">
                <button
                  className="flex items-start justify-between gap-3 w-full text-left"
                  onClick={() => toggleSession(s.id)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-bn-muted">
                      <span>{formatDate(s.created_at)}</span>
                      <span className="text-bn-quiet">·</span>
                      <span>{periodLabel(s.period_days)}</span>
                      <span className="text-bn-quiet">·</span>
                      <span>{s.bets_analysed} bets</span>
                      {s.calibration_grade && (
                        <>
                          <span className="text-bn-quiet">·</span>
                          <CalibrationBadge grade={s.calibration_grade} />
                        </>
                      )}
                    </div>
                    {!isExpanded && (
                      <p className="mt-1 line-clamp-1 text-sm text-bn-muted">{s.summary}</p>
                    )}
                  </div>
                  <span className="mt-0.5 shrink-0 text-xs text-bn-muted">
                    {isExpanded ? '▲' : '▼'}
                  </span>
                </button>

                {isExpanded && (
                  <div className="mt-4 border-t border-bn-border-subtle pt-4">
                    <SessionCard
                      session={s}
                      expandedRecs={expandedRecs}
                      onToggleRec={toggleRec}
                    />
                  </div>
                )}
              </BroadcastPanel>
            )
          })}
        </div>
      )}
    </div>
  )
}
