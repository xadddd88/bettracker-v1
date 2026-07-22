'use client'

import { useState, useCallback } from 'react'
import Link from 'next/link'
import type { CoachingSession, CalibrationGrade, CoachRecommendation } from '@/types'

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
  const config: Record<CalibrationGrade, { label: string; emoji: string; style: string }> = {
    excellent: { label: 'Excellent calibration', emoji: '✓', style: 'bn-status-success' },
    good:      { label: 'Good calibration',      emoji: '•', style: 'bn-status-neutral' },
    fair:      { label: 'Fair calibration',       emoji: '!', style: 'bn-status-review' },
    poor:      { label: 'Poor calibration',       emoji: '×', style: 'bn-status-negative' },
  }
  const c = config[grade]
  return (
    <span className={`bn-status shrink-0 ${c.style}`}>
      {c.emoji} {c.label}
    </span>
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
  const priorityStyle = {
    high:   'border-[var(--negative)] text-[var(--negative)]',
    medium: 'border-[var(--review)] text-[var(--review)]',
    low:    'border-[var(--border-strong)] text-[var(--text-muted)]',
  }[rec.priority]

  return (
    <div className="border border-[var(--border-subtle)] bg-[var(--field-raised)] px-3 py-3 flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <span className="flex-1 text-sm font-medium text-[var(--text-primary)]">{rec.action}</span>
        <span className={`shrink-0 border px-2 py-1 text-[11px] font-bold uppercase tracking-wide ${priorityStyle}`}>
          {rec.priority}
        </span>
      </div>
      {expanded && (
        <p className="text-xs leading-relaxed text-[var(--text-muted)]">{rec.detail}</p>
      )}
      <button
        onClick={() => onToggle(recKey)}
        className="min-h-11 text-left text-xs font-bold text-[var(--signal)] transition-colors"
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
        <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)]">
          <span>{periodLabel(session.period_days)}</span>
          <span className="text-[var(--border-strong)]">·</span>
          <span>{formatDate(session.created_at)}</span>
          <span className="text-[var(--border-strong)]">·</span>
          <span>{session.bets_analysed} bets analysed</span>
        </div>
        <CalibrationBadge grade={session.calibration_grade} />
      </div>
      {session.calibration_grade && (
        <p className="-mt-2 text-xs text-[var(--text-muted)]">Calibration: how well your confidence predictions matched your actual results.</p>
      )}

      {/* Summary */}
      <p className="text-sm leading-relaxed text-[var(--text-primary)]">{session.summary}</p>

      {/* Strengths */}
      {session.strengths.length > 0 && (
        <div>
          <p className="editorial-kicker mb-1.5 text-[var(--success)]">Strengths</p>
          <ul className="flex flex-col gap-1.5">
            {session.strengths.map((s, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-[var(--text-primary)]">
                <span className="mt-0.5 shrink-0 text-[var(--success)]">&#10003;</span>
                {s}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Weaknesses */}
      {session.weaknesses.length > 0 && (
        <div>
          <p className="editorial-kicker mb-1.5 text-[var(--review)]">Areas to improve</p>
          <ul className="flex flex-col gap-1.5">
            {session.weaknesses.map((w, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-[var(--text-primary)]">
                <span className="mt-0.5 shrink-0 text-[var(--review)]">!</span>
                {w}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Recommendations */}
      {session.recommendations.length > 0 && (
        <div>
          <p className="editorial-kicker mb-1.5">Coaching notes</p>
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
      <p className="border-l-2 border-[var(--review)] px-3 py-2 text-xs leading-relaxed text-[var(--text-muted)]">
        ! {session.disclaimer ?? 'Past performance does not predict future results. This analysis is retrospective and does not constitute financial advice.'}
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
    <div className="bn-page flex flex-col gap-6">
      {/* ── Run Coach form ──────────────────────────────────── */}
      <div className="bn-panel flex flex-col gap-4 p-4 sm:p-5">
        {/* Period selector */}
        <div>
          <label className="label mb-2">Period</label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {PERIODS.map(p => (
              <button
                key={p.value}
                onClick={() => setPeriodDays(p.value)}
                disabled={!canRun}
                className={`bn-button w-full ${
                  periodDays === p.value
                    ? 'bn-button-primary'
                    : 'bn-button-secondary'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-[var(--text-muted)]">Limits the AI to settled bets within this window — narrower periods show recent trends.</p>
        </div>

        {/* Focus notes */}
        <div>
          <label className="label">Focus notes <span className="font-normal text-[var(--text-muted)]">(optional)</span></label>
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
            <p className="mt-1 text-right text-xs text-[var(--text-muted)]">{focusNotes.length}/500</p>
          )}
        </div>

        {/* Gate message */}
        {!canRun && (
          <p className="bn-status bn-status-review w-full justify-start">
            <span className="bn-status-icon" aria-hidden>!</span><span>Add at least 5 settled bets first.</span>
          </p>
        )}

        {/* Error */}
        {error && (
          <div className="bn-status bn-status-negative w-full justify-start" role="alert">
            <span className="bn-status-icon" aria-hidden>×</span><span>{error}</span>
          </div>
        )}

        <button
          className="bn-button bn-button-primary w-full sm:w-auto sm:self-start"
          onClick={handleCoach}
          disabled={loading || !canRun}
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <span className="animate-spin">&#9203;</span> Analyzing…
            </span>
          ) : 'Run Coach'}
        </button>
      </div>

      {/* ── Latest session ──────────────────────────────────── */}
      {latestSession ? (
        <div className="bn-panel p-4 sm:p-5">
          <SessionCard
            session={latestSession}
            expandedRecs={expandedRecs}
            onToggleRec={toggleRec}
          />
        </div>
      ) : (
        <div className="bn-panel flex flex-col items-center gap-3 px-5 py-10 text-center">
          <span className="text-3xl text-[var(--border-strong)]">—</span>
          <p className="text-sm font-medium text-[var(--text-primary)]">No coaching sessions yet</p>
          <p className="text-xs text-[var(--text-muted)]">
            {canRun
              ? 'Run Coach to get your first performance analysis.'
              : "Run Coach after you've settled at least 5 bets."}
          </p>
        </div>
      )}

      {/* ── Next-step CTA ──────────────────────────────────── */}
      {latestSession && (
        <div className="flex items-center justify-between px-1">
          <p className="text-xs text-[var(--text-muted)]">Apply these insights in your next analysis.</p>
          <Link href="/ai" className="min-h-11 shrink-0 py-3 text-xs font-bold text-[var(--signal)] transition-colors">AI Analyst →</Link>
        </div>
      )}

      {/* ── Past sessions ───────────────────────────────────── */}
      {pastSessions.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="editorial-kicker">Past sessions</p>
          {pastSessions.map(s => {
            const isExpanded = expandedSessions.has(s.id)
            return (
              <div key={s.id} className="bn-panel p-4 sm:p-5">
                <button
                  className="flex items-start justify-between gap-3 w-full text-left"
                  onClick={() => toggleSession(s.id)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)]">
                      <span>{formatDate(s.created_at)}</span>
                      <span className="text-[var(--border-strong)]">·</span>
                      <span>{periodLabel(s.period_days)}</span>
                      <span className="text-[var(--border-strong)]">·</span>
                      <span>{s.bets_analysed} bets</span>
                      {s.calibration_grade && (
                        <>
                          <span className="text-[var(--border-strong)]">·</span>
                          <CalibrationBadge grade={s.calibration_grade} />
                        </>
                      )}
                    </div>
                    {!isExpanded && (
                      <p className="mt-1 line-clamp-1 text-sm text-[var(--text-muted)]">{s.summary}</p>
                    )}
                  </div>
                  <span className="mt-0.5 shrink-0 text-xs text-[var(--text-muted)]">
                    {isExpanded ? '▲' : '▼'}
                  </span>
                </button>

                {isExpanded && (
                  <div className="mt-4 border-t border-[var(--border-subtle)] pt-4">
                    <SessionCard
                      session={s}
                      expandedRecs={expandedRecs}
                      onToggleRec={toggleRec}
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
