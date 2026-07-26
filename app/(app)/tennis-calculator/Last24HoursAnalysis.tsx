'use client'

import { useState } from 'react'

import {
  BroadcastButton,
  BroadcastStatus,
} from '@/components/ui/BroadcastNoir'
import type {
  FortyFortyAggregate,
  FortyFortyAnalysis,
} from '@/lib/tennis/forty-forty-analysis'

interface AnalysisResponse {
  success: true
  analysis: FortyFortyAnalysis
}

function formatPercent(value: number | null): string {
  if (value === null) return '—'
  return `${value.toLocaleString('ru-RU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}%`
}

function formatNumber(value: number | null): string {
  if (value === null) return '—'
  return value.toLocaleString('ru-RU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Europe/Kyiv',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function tourCard(
  label: string,
  aggregate: FortyFortyAggregate,
  borderClass: string,
) {
  return (
    <div className={`p-4 sm:p-5 ${borderClass}`}>
      <span className="stat-label">{label}</span>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
        <span className="font-display text-4xl font-black tracking-[-0.05em] text-bn-text">
          {formatPercent(aggregate.gameRatePct)}
        </span>
        <span className="font-mono text-xs text-bn-muted">
          {aggregate.hits}/{aggregate.games} геймов
        </span>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-bn-border-subtle pt-3">
        <div>
          <dt className="text-[11px] font-black uppercase tracking-[0.1em] text-bn-quiet">
            Хотя бы одно 40:40
          </dt>
          <dd className="mt-1 font-mono text-sm font-black text-bn-text">
            {aggregate.matchesWithHit}/{aggregate.matches} матчей
          </dd>
        </div>
        <div>
          <dt className="text-[11px] font-black uppercase tracking-[0.1em] text-bn-quiet">
            В среднем за матч
          </dt>
          <dd className="mt-1 font-mono text-sm font-black text-bn-text">
            {formatNumber(aggregate.averageHitsPerMatch)}
          </dd>
        </div>
      </dl>
    </div>
  )
}

function comparisonText(analysis: FortyFortyAnalysis): string {
  const { leader, differencePercentagePoints } = analysis.comparison
  if (leader === 'insufficient_data' || differencePercentagePoints === null) {
    return 'Для сравнения нужны хотя бы один полностью покрытый мужской и один женский одиночный матч.'
  }
  if (leader === 'equal') {
    return 'В этой 24-часовой выборке частота 40:40 по геймам у мужских и женских одиночных матчей одинаковая.'
  }
  const category = leader === 'ATP' ? 'мужских одиночных матчах' : 'женских одиночных матчах'
  return `В этой выборке 40:40 чаще встречалось в ${category}: разница ${differencePercentagePoints.toLocaleString('ru-RU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} п.п.`
}

function isAnalysisResponse(value: unknown): value is AnalysisResponse {
  if (typeof value !== 'object' || value === null) return false
  const response = value as Record<string, unknown>
  if (response.success !== true || typeof response.analysis !== 'object' || response.analysis === null) {
    return false
  }
  const analysis = response.analysis as Record<string, unknown>
  return (
    typeof analysis.generatedAt === 'string'
    && typeof analysis.foundMatches === 'number'
    && typeof analysis.analyzedMatches === 'number'
    && Array.isArray(analysis.matches)
  )
}

export function Last24HoursAnalysis() {
  const [analysis, setAnalysis] = useState<FortyFortyAnalysis | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function runAnalysis() {
    if (loading) return
    setLoading(true)
    setError('')

    try {
      const response = await fetch('/api/tennis/forty-forty/last-24-hours', {
        method: 'GET',
        cache: 'no-store',
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
      })
      const payload: unknown = await response.json().catch(() => null)

      if (!response.ok || !isAnalysisResponse(payload)) {
        if (response.status === 429) {
          throw new Error('Слишком много запусков подряд. Подождите минуту и повторите.')
        }
        if (response.status === 401) {
          throw new Error('Сессия завершилась. Войдите в BetTracker ещё раз.')
        }
        throw new Error('Не удалось получить данные провайдера. Попробуйте ещё раз позже.')
      }

      setAnalysis(payload.analysis)
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : 'Не удалось выполнить анализ.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section
      className="border-t border-bn-border-strong p-5 sm:p-6"
      aria-labelledby="last-24-hours-title"
    >
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="editorial-kicker">Живые данные · API-Tennis</p>
          <h2
            id="last-24-hours-title"
            className="mt-2 font-display text-2xl font-black tracking-[-0.04em] text-bn-text"
          >
            Что было за последние 24 часа
          </h2>
          <p className="mt-2 max-w-xl text-xs leading-5 text-bn-muted">
            Завершённые мужские и женские одиночные матчи, начавшиеся за
            скользящие 24 часа: ATP/WTA, Challenger и ITF, только основная сетка.
          </p>
        </div>
        <BroadcastButton
          className="min-h-12 w-full shrink-0 sm:w-auto"
          onClick={runAnalysis}
          disabled={loading}
          aria-busy={loading}
        >
          {loading ? 'Считаю 40:40…' : 'Анализ за последние 24 часа'}
        </BroadcastButton>
      </div>

      <p className="mt-3 text-[11px] leading-5 text-bn-quiet">
        Не входят: квалификации, парные, смешанные, юниорские и выставочные матчи.
        Считаются только матчи с полной историей очков; тай-брейки исключены.
      </p>

      {error ? (
        <div
          className="mt-5 border-l-2 border-bn-negative bg-bn-field px-4 py-3 text-xs leading-5 text-bn-muted"
          role="alert"
          aria-live="assertive"
        >
          {error}
        </div>
      ) : null}

      {analysis ? (
        <div className="mt-6" aria-live="polite">
          <div className="flex flex-wrap items-center justify-between gap-3 border-y border-bn-border-subtle py-3">
            <BroadcastStatus status="success">
              {analysis.analyzedMatches} матчей проанализировано
            </BroadcastStatus>
            <span className="font-mono text-[11px] text-bn-muted">
              {formatDateTime(analysis.window.from)} — {formatDateTime(analysis.window.to)} · Киев
            </span>
          </div>

          <dl className="grid grid-cols-3 border-b border-bn-border-subtle">
            <div className="border-r border-bn-border-subtle py-4 pr-3">
              <dt className="stat-label">Найдено</dt>
              <dd className="mt-1 font-mono text-xl font-black text-bn-text">
                {analysis.foundMatches}
              </dd>
            </div>
            <div className="border-r border-bn-border-subtle px-3 py-4">
              <dt className="stat-label">Полные данные</dt>
              <dd className="mt-1 font-mono text-xl font-black text-bn-signal">
                {analysis.analyzedMatches}
              </dd>
            </div>
            <div className="py-4 pl-3">
              <dt className="stat-label">Пропущено</dt>
              <dd className="mt-1 font-mono text-xl font-black text-bn-text">
                {analysis.skippedMatches}
              </dd>
            </div>
          </dl>

          <div className="mt-5 flex flex-wrap items-end justify-between gap-4 border-l-2 border-bn-signal bg-bn-field px-4 py-4">
            <div>
              <p className="stat-label">Всего срабатываний 40:40</p>
              <p className="mt-1 font-display text-5xl font-black tracking-[-0.055em] text-bn-text">
                {analysis.total.hits}
              </p>
            </div>
            <p className="font-mono text-xs leading-5 text-bn-muted">
              {analysis.total.hits}/{analysis.total.games} геймов
              <br />
              {formatPercent(analysis.total.gameRatePct)}
            </p>
          </div>

          <div className="mt-5 grid overflow-hidden rounded-control border border-bn-border-subtle bg-bn-border-subtle sm:grid-cols-2">
            {tourCard('Мужчины · одиночные', analysis.men, 'border-b border-bn-border-subtle bg-bn-field sm:border-b-0 sm:border-r')}
            {tourCard('Женщины · одиночные', analysis.women, 'bg-bn-field')}
          </div>

          <div className="mt-4 border-l-2 border-bn-signal pl-4">
            <p className="text-xs font-black leading-5 text-bn-text">Сравнение ATP и WTA</p>
            <p className="mt-1 text-xs leading-5 text-bn-muted">{comparisonText(analysis)}</p>
          </div>

          {analysis.skippedMatches > 0 ? (
            <p className="mt-4 text-[11px] leading-5 text-bn-quiet">
              {analysis.skippedMatches} завершённых матчей не вошли в проценты:
              у провайдера не было полной point-by-point истории. Они показаны в покрытии,
              но не искажают знаменатель.
            </p>
          ) : null}

          {analysis.matches.length > 0 ? (
            <details className="mt-5 border-t border-bn-border-subtle pt-4">
              <summary className="cursor-pointer text-xs font-black text-bn-text">
                Матчи в расчёте · {analysis.matches.length}
              </summary>
              <div className="mt-3 divide-y divide-bn-border-subtle border-y border-bn-border-subtle">
                {analysis.matches.map((match, index) => (
                  <div
                    key={`${match.startedAt}:${match.players}:${index}`}
                    className="grid gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-xs font-black text-bn-text">
                        {match.players}
                      </p>
                      <p className="mt-1 truncate text-[11px] text-bn-muted">
                        {match.tour} · {match.tournament} · {formatDateTime(match.startedAt)}
                      </p>
                    </div>
                    <span className="font-mono text-xs font-black text-bn-data">
                      {match.hits}/{match.games} геймов · {formatPercent(
                        match.games > 0 ? (match.hits / match.games) * 100 : null,
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </details>
          ) : (
            <p className="mt-5 text-xs leading-5 text-bn-muted">
              В этом окне нет завершённых одиночных матчей с полной историей очков.
              Нулевой результат не означает, что 40:40 не происходило в матчах без полной
              поточечной истории.
            </p>
          )}

          <div className="mt-5 bg-bn-field p-4">
            <p className="text-[11px] leading-5 text-bn-muted">
              Частота считается как количество обычных геймов, в которых хотя бы раз был
              счёт 40:40, делённое на все полностью покрытые обычные геймы. Это описание
              прошедшей выборки, а не прогноз следующего матча и не гарантия результата.
            </p>
          </div>
        </div>
      ) : null}
    </section>
  )
}
