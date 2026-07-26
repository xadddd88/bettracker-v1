'use client'

import { useState, useCallback } from 'react'
import Link from 'next/link'
import type { CoachingSession, CalibrationGrade, CoachRecommendation } from '@/types'
import { BroadcastButton, BroadcastPanel, BroadcastStatus } from '@/components/ui/BroadcastNoir'
import type { BroadcastNoirStatus } from '@/lib/ui/broadcast-noir'

type PeriodDays = 7 | 30 | 90 | 0

const PERIODS: { value: PeriodDays; label: string }[] = [
  { value: 7,  label: '7 дней' },
  { value: 30, label: '30 дней' },
  { value: 90, label: '90 дней' },
  { value: 0,  label: 'Всё время' },
]

function periodLabel(days: number): string {
  if (days === 0) return 'Всё время'
  return `Последние ${days} дней`
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('ru-RU', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

function priorityLabel(priority: CoachRecommendation['priority']): string {
  if (priority === 'high') return 'Высокий'
  if (priority === 'medium') return 'Средний'
  return 'Низкий'
}

// ─── Calibration grade badge ──────────────────────────────────
function CalibrationBadge({ grade }: { grade?: CalibrationGrade | null }) {
  if (!grade) return null
  const config: Record<CalibrationGrade, { label: string; status: BroadcastNoirStatus }> = {
    excellent: { label: 'Отличная калибровка', status: 'success' },
    good:      { label: 'Хорошая калибровка', status: 'success' },
    fair:      { label: 'Средняя калибровка', status: 'review' },
    poor:      { label: 'Слабая калибровка', status: 'negative' },
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
        <BroadcastStatus className="shrink-0" status={priorityStatus}>{priorityLabel(rec.priority)}</BroadcastStatus>
      </div>
      {expanded && (
        <p className="text-xs leading-relaxed text-bn-muted">{rec.detail}</p>
      )}
      <button
        onClick={() => onToggle(recKey)}
        className="min-h-11 text-left text-xs font-bold text-bn-text underline underline-offset-4"
      >
        {expanded ? 'Скрыть детали' : 'Показать детали'}
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
          <span>Ставок в анализе: {session.bets_analysed}</span>
        </div>
        <CalibrationBadge grade={session.calibration_grade} />
      </div>
      {session.calibration_grade && (
        <p className="-mt-2 text-[11px] text-bn-muted">Калибровка показывает, насколько ваша уверенность совпадала с фактическими результатами.</p>
      )}

      {/* Summary */}
      <p className="text-sm leading-relaxed text-bn-text">{session.summary}</p>

      {/* Strengths */}
      {session.strengths.length > 0 && (
        <div>
          <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-bn-success">Сильные стороны</p>
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
          <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-bn-review">Что улучшить</p>
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
          <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-bn-text">Рекомендации</p>
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
        &#9888; {session.disclaimer ?? 'Прошлые результаты не предсказывают будущие. Анализ является ретроспективой и не является финансовой рекомендацией.'}
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
        setError(json.error ?? 'Коуч не сработал. Попробуйте ещё раз.')
        return
      }
      setSessions(prev => [json.data as CoachingSession, ...prev])
    } catch {
      setError('Ошибка сети — попробуйте ещё раз.')
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
          <label className="label mb-2">Период</label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {PERIODS.map(p => (
              <BroadcastButton
                key={p.value}
                onClick={() => setPeriodDays(p.value)}
                disabled={!canRun}
                aria-pressed={periodDays === p.value}
                className="w-full"
                tone={periodDays === p.value ? 'primary' : 'secondary'}
              >
                {p.label}
              </BroadcastButton>
            ))}
          </div>
          <p className="mt-1.5 text-[11px] text-bn-muted">Коуч берёт только закрытые ставки внутри выбранного окна. Узкий период лучше показывает свежие паттерны.</p>
        </div>

        {/* Focus notes */}
        <div>
          <label className="label">Фокус анализа <span className="font-normal text-bn-quiet">(необязательно)</span></label>
          <textarea
            className="input resize-none mt-1"
            rows={2}
            maxLength={500}
            placeholder="Что проверить отдельно? Например: кажется, я перебираю с футбольными экспрессами..."
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
          <BroadcastStatus className="w-full" status="review">Сначала нужно закрыть хотя бы 5 ставок.</BroadcastStatus>
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
              Анализируем...
            </span>
          ) : 'Получить разбор'}
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
          <BroadcastStatus status="neutral">Пусто</BroadcastStatus>
          <p className="text-sm font-medium text-bn-text">Разборов пока нет</p>
          <p className="text-xs text-bn-muted">
            {canRun
              ? 'Запустите Коуч, чтобы получить первый разбор результатов.'
              : 'Коуч станет доступен после 5 закрытых ставок.'}
          </p>
        </BroadcastPanel>
      )}

      {/* ── Next-step CTA ──────────────────────────────────── */}
      {latestSession && (
        <div className="flex items-center justify-between px-1">
          <p className="text-xs text-bn-muted">Примените выводы в следующем анализе.</p>
          <Link href="/ai" className="shrink-0 text-xs font-bold text-bn-text underline underline-offset-4">→ AI Analyst</Link>
        </div>
      )}

      {/* ── Past sessions ───────────────────────────────────── */}
      {pastSessions.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-bn-quiet">Прошлые разборы</p>
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
                      <span>Ставок: {s.bets_analysed}</span>
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
