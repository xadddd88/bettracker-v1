'use client'

import { useState, useCallback } from 'react'
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
    excellent: { label: 'Excellent calibration', emoji: '🟢', style: 'text-green-400 bg-green-950/40 border-green-800' },
    good:      { label: 'Good calibration',      emoji: '🟡', style: 'text-yellow-400 bg-yellow-950/40 border-yellow-800' },
    fair:      { label: 'Fair calibration',       emoji: '🟠', style: 'text-amber-400 bg-amber-950/40 border-amber-800' },
    poor:      { label: 'Poor calibration',       emoji: '🔴', style: 'text-red-400 bg-red-950/40 border-red-800' },
  }
  const c = config[grade]
  return (
    <span className={`text-xs font-medium border rounded-full px-2 py-0.5 shrink-0 ${c.style}`}>
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
    high:   'text-red-400 bg-red-950/40 border-red-900',
    medium: 'text-yellow-400 bg-yellow-950/40 border-yellow-900',
    low:    'text-gray-400 bg-gray-800 border-gray-700',
  }[rec.priority]

  return (
    <div className="bg-gray-800/60 border border-gray-700 rounded-lg px-3 py-2.5 flex flex-col gap-1.5">
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm text-white font-medium flex-1">{rec.action}</span>
        <span className={`text-[10px] font-semibold border rounded-full px-1.5 py-0.5 shrink-0 uppercase tracking-wide ${priorityStyle}`}>
          {rec.priority}
        </span>
      </div>
      {expanded && (
        <p className="text-xs text-gray-400 leading-relaxed">{rec.detail}</p>
      )}
      <button
        onClick={() => onToggle(recKey)}
        className="text-xs text-indigo-400 hover:text-indigo-300 text-left transition-colors"
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
        <div className="flex items-center gap-2 flex-wrap text-xs text-gray-500">
          <span>{periodLabel(session.period_days)}</span>
          <span className="text-gray-700">·</span>
          <span>{formatDate(session.created_at)}</span>
          <span className="text-gray-700">·</span>
          <span>{session.bets_analysed} bets analysed</span>
        </div>
        <CalibrationBadge grade={session.calibration_grade} />
      </div>

      {/* Summary */}
      <p className="text-sm text-gray-200 leading-relaxed">{session.summary}</p>

      {/* Strengths */}
      {session.strengths.length > 0 && (
        <div>
          <p className="text-[11px] font-medium text-green-500 uppercase tracking-wide mb-1.5">Strengths</p>
          <ul className="flex flex-col gap-1.5">
            {session.strengths.map((s, i) => (
              <li key={i} className="text-sm text-gray-300 flex items-start gap-2">
                <span className="text-green-500 mt-0.5 shrink-0">&#10003;</span>
                {s}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Weaknesses */}
      {session.weaknesses.length > 0 && (
        <div>
          <p className="text-[11px] font-medium text-amber-500 uppercase tracking-wide mb-1.5">Areas to improve</p>
          <ul className="flex flex-col gap-1.5">
            {session.weaknesses.map((w, i) => (
              <li key={i} className="text-sm text-gray-300 flex items-start gap-2">
                <span className="text-amber-400 mt-0.5 shrink-0">&#9888;</span>
                {w}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Recommendations */}
      {session.recommendations.length > 0 && (
        <div>
          <p className="text-[11px] font-medium text-indigo-400 uppercase tracking-wide mb-1.5">Recommendations</p>
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
      <p className="text-[11px] text-gray-600 border border-gray-800 rounded-lg px-3 py-2 leading-relaxed">
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
      <div className="card flex flex-col gap-4">
        {/* Period selector */}
        <div>
          <label className="label mb-2">Period</label>
          <div className="flex gap-2">
            {PERIODS.map(p => (
              <button
                key={p.value}
                onClick={() => setPeriodDays(p.value)}
                disabled={!canRun}
                className={`flex-1 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                  periodDays === p.value
                    ? 'bg-indigo-600 border-indigo-500 text-white'
                    : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500 disabled:opacity-40 disabled:cursor-not-allowed'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Focus notes */}
        <div>
          <label className="label">Focus notes <span className="text-gray-600 font-normal">(optional)</span></label>
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
            <p className="text-[11px] text-gray-500 mt-0.5 text-right">{focusNotes.length}/500</p>
          )}
        </div>

        {/* Gate message */}
        {!canRun && (
          <p className="text-xs text-amber-400 bg-amber-950/40 border border-amber-900 rounded-lg px-3 py-2">
            Add at least 5 settled bets first.
          </p>
        )}

        {/* Error */}
        {error && (
          <div className="text-xs text-red-400 bg-red-950/40 border border-red-900 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        <button
          className="btn-primary"
          onClick={handleCoach}
          disabled={loading || !canRun}
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <span className="animate-spin">&#9203;</span> Analysing…
            </span>
          ) : '🧠 Get coaching'}
        </button>
      </div>

      {/* ── Latest session ──────────────────────────────────── */}
      {latestSession ? (
        <div className="card">
          <SessionCard
            session={latestSession}
            expandedRecs={expandedRecs}
            onToggleRec={toggleRec}
          />
        </div>
      ) : (
        <div className="card flex flex-col items-center gap-3 py-10 text-center">
          <span className="text-3xl text-slate-600">—</span>
          <p className="text-sm font-medium text-gray-400">No coaching sessions yet</p>
          <p className="text-xs text-gray-600">
            {canRun
              ? 'Run Coach to get your first performance analysis.'
              : "Run Coach after you've settled at least 5 bets."}
          </p>
        </div>
      )}

      {/* ── Past sessions ───────────────────────────────────── */}
      {pastSessions.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Past sessions</p>
          {pastSessions.map(s => {
            const isExpanded = expandedSessions.has(s.id)
            return (
              <div key={s.id} className="card">
                <button
                  className="flex items-start justify-between gap-3 w-full text-left"
                  onClick={() => toggleSession(s.id)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap text-xs text-gray-500">
                      <span>{formatDate(s.created_at)}</span>
                      <span className="text-gray-700">·</span>
                      <span>{periodLabel(s.period_days)}</span>
                      <span className="text-gray-700">·</span>
                      <span>{s.bets_analysed} bets</span>
                      {s.calibration_grade && (
                        <>
                          <span className="text-gray-700">·</span>
                          <CalibrationBadge grade={s.calibration_grade} />
                        </>
                      )}
                    </div>
                    {!isExpanded && (
                      <p className="text-sm text-gray-400 mt-1 line-clamp-1">{s.summary}</p>
                    )}
                  </div>
                  <span className="text-gray-600 text-xs mt-0.5 shrink-0">
                    {isExpanded ? '▲' : '▼'}
                  </span>
                </button>

                {isExpanded && (
                  <div className="mt-4 pt-4 border-t border-gray-800">
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
