'use client'

import { useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  TRACKED_BET_SPORTS,
  MAX_TRACKED_BET_LEGS,
  trackedBetFormSchema,
  draftsToRequestLegs,
  computeExpressPreviewTotal,
  scannerDataToDrafts,
  emptyLegDraft,
  createSubmitIntent,
  beginSubmit,
  resolveSubmit,
  fingerprintPayload,
  type LegDraft,
  type TrackedBetSport,
  type SubmitIntent,
} from '@/lib/bets/tracked-bet'

const SPORT_LABEL: Record<TrackedBetSport, string> = {
  soccer: 'Soccer / Football',
  tennis: 'Tennis',
  basketball: 'Basketball',
  ice_hockey: 'Ice Hockey',
  cs2: 'CS2',
  mma: 'MMA',
  other: 'Other',
}
const BOOKMAKERS = ['Bet365', 'William Hill', '1xBet', 'Stake', 'Pinnacle', 'Other']

type FormErrors = Record<string, string | undefined>

// ─── Image helpers ───────────────────────────────────────────
function fileToBase64(file: File): Promise<{ data: string; media_type: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      const [header, data] = result.split(',')
      const media_type = header.match(/data:(.*);base64/)?.[1] ?? 'image/jpeg'
      resolve({ data, media_type })
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export default function NewBetPage() {
  const router  = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)

  // Idempotency lifecycle (Decision #060 Phase B): the PURE intent
  // state machine lives in lib/bets/tracked-bet.ts (fingerprint-bound
  // UUID, ready | in_flight | conflict) and is unit-tested there with
  // an injected UUID generator. This component only wires HTTP
  // outcomes into transitions — it holds NO lifecycle logic of its
  // own. The ref updates synchronously, so double clicks are blocked
  // before any network call; the server-side replay is the backstop.
  const intentRef = useRef<SubmitIntent>(createSubmitIntent())

  const [loading,  setLoading]  = useState(false)
  const [scanning, setScanning] = useState(false)
  const [scanMsg,  setScanMsg]  = useState('')
  const [errors,   setErrors]   = useState<FormErrors>({})

  const [legs, setLegs]           = useState<LegDraft[]>([emptyLegDraft()])
  const [stake, setStake]         = useState('')
  const [totalOdds, setTotalOdds] = useState('')
  const [bookmaker, setBookmaker] = useState('')
  const [notes, setNotes]         = useState('')
  const [source, setSource]       = useState<'manual' | 'scanner'>('manual')

  const isExpress    = legs.length >= 2
  const previewTotal = computeExpressPreviewTotal(legs)

  function clearError(key: string) {
    setErrors(e => ({ ...e, [key]: undefined, _root: undefined }))
  }

  // ── Leg operations (array order IS the leg order) ──────────
  function updateLeg(index: number, field: keyof LegDraft, value: string) {
    setLegs(current => current.map((leg, i) => (i === index ? { ...leg, [field]: value } : leg)))
    clearError(`legs.${index}.${field}`)
  }

  function addLeg() {
    setLegs(current =>
      current.length >= MAX_TRACKED_BET_LEGS
        ? current
        : [...current, emptyLegDraft(current[current.length - 1]?.sport ?? 'soccer')]
    )
    clearError('legs')
  }

  function removeLeg(index: number) {
    setLegs(current => (current.length <= 1 ? current : current.filter((_, i) => i !== index)))
    clearError('legs')
  }

  // ── Scanner (existing OCR flow; recognized legs become editable) ──
  const runScanner = useCallback(async (file: File) => {
    setScanning(true)
    setScanMsg('Scanning coupon...')

    try {
      const { data, media_type } = await fileToBase64(file)

      const res = await fetch('/api/ai/scanner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: data, media_type }),
      })

      const json = await res.json()
      if (!res.ok || !json.success) {
        setScanMsg(json.error ?? 'Scan failed')
        return
      }

      // Allowlisted adapter: only sport/event/market/selection/odds
      // reach the drafts — OCR/live noise never leaves this handler.
      const mapped = scannerDataToDrafts(json.data)
      setLegs(mapped.legs)
      setTotalOdds(mapped.totalOdds)
      if (mapped.stake) setStake(mapped.stake)
      if (mapped.bookmaker) setBookmaker(mapped.bookmaker)
      setSource('scanner')
      setErrors({})
      setScanMsg(
        mapped.legs.length >= 2
          ? `✅ Express scanned — ${mapped.legs.length} legs. Review and save`
          : '✅ Coupon scanned — review and save'
      )
    } catch {
      setScanMsg('Scan error — try again')
    } finally {
      setScanning(false)
    }
  }, [])

  // Ctrl+V paste
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = Array.from(e.clipboardData.items)
    const imageItem = items.find(i => i.type.startsWith('image/'))
    if (imageItem) {
      const file = imageItem.getAsFile()
      if (file) runScanner(file)
    }
  }, [runScanner])

  // File picker
  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) runScanner(file)
    e.target.value = ''
  }, [runScanner])

  // ── Submit ─────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErrors({})

    const payload = {
      legs:       draftsToRequestLegs(legs),
      total_odds: isExpress ? (totalOdds.trim() === '' ? null : Number(totalOdds)) : null,
      stake:      stake.trim() === '' ? undefined : Number(stake),
      bookmaker:  bookmaker.trim() === '' ? null : bookmaker.trim(),
      notes:      notes.trim() === '' ? null : notes.trim(),
      source,
    }

    const parsed = trackedBetFormSchema.safeParse(payload)
    if (!parsed.success) {
      const fieldErrors: FormErrors = {}
      for (const issue of parsed.error.issues) {
        fieldErrors[issue.path.join('.') || '_root'] = issue.message
      }
      setErrors(fieldErrors)
      return
    }

    // All lifecycle decisions come from the pure state machine; the
    // browser UUID generator is injected exactly like in the tests.
    const begin = beginSubmit(
      intentRef.current,
      fingerprintPayload(parsed.data),
      () => crypto.randomUUID()
    )
    if (!begin.ok) {
      // 'in_flight': double click — silently ignored (button is locked).
      // 'conflict_unchanged': the conflicted intent was resubmitted
      // unchanged — blocked with no network call and NO new UUID.
      if (begin.reason === 'conflict_unchanged') {
        setErrors({ _root: 'Request conflict' })
      }
      return
    }
    intentRef.current = begin.intent

    setLoading(true)

    try {
      const res = await fetch('/api/bets/tracked', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...parsed.data, idempotency_key: begin.key }),
      })

      const json = await res.json().catch(() => ({}))

      if (res.ok && json.success) {
        // Success and replay both open the created bet's detail page;
        // server components re-read bankroll/dashboard data on refresh.
        intentRef.current = resolveSubmit(intentRef.current, 'success')
        router.push(`/bets/${json.bet_id}`)
        router.refresh()
        return
      }

      if (res.status === 409) {
        // Ambiguous conflict: the machine KEEPS the UUID and snapshot
        // and locks this intent — no automatic retry, no key rotation.
        // Only a deliberate payload change starts a new intent.
        intentRef.current = resolveSubmit(intentRef.current, 'conflict')
        setErrors({ _root: 'Request conflict' })
        return
      }

      // Every other failure keeps the UUID and snapshot so an exact
      // retry replays server-side instead of creating a second bet.
      intentRef.current = resolveSubmit(intentRef.current, 'retryable')
      if (res.status === 401) {
        setErrors({ _root: 'Session expired — please sign in again.' })
      } else if (res.status === 429) {
        setErrors({ _root: 'Too many bets — please wait a moment and try again.' })
      } else if (res.status === 503) {
        setErrors({ _root: 'Service temporarily unavailable — try again shortly. Retrying is safe.' })
      } else if (res.status === 400 || res.status === 404 || res.status === 422) {
        // Sanitized, deterministic messages from our own API.
        setErrors({ _root: json.error ?? 'Bet validation failed' })
      } else {
        setErrors({ _root: 'Bet could not be saved — press Save again. Retrying is safe.' })
      }
    } catch {
      // Network-unknown result: keep the UUID and snapshot for an
      // exact retry.
      intentRef.current = resolveSubmit(intentRef.current, 'retryable')
      setErrors({ _root: 'Network error — check your connection and press Save again. Retrying is safe.' })
    } finally {
      setLoading(false)
    }
  }

  const stakeNum = Number(stake)
  const effectiveTotal = isExpress ? Number(totalOdds) : Number(legs[0]?.odds)
  const showPayoutPreview =
    Number.isFinite(stakeNum) && stakeNum > 0 && Number.isFinite(effectiveTotal) && effectiveTotal > 1

  return (
    <div className="max-w-xl" onPaste={handlePaste}>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Add Bet</h1>
        <p className="text-sm text-gray-500 mt-1">Paste a screenshot or fill in manually</p>
      </div>

      {/* ── Scanner zone ──────────────────────────────────── */}
      <div
        className={`mb-4 border-2 border-dashed rounded-xl px-4 py-5 text-center cursor-pointer transition-colors ${
          scanning
            ? 'border-indigo-500 bg-indigo-950/30'
            : 'border-gray-700 hover:border-indigo-600 hover:bg-gray-800/40'
        }`}
        onClick={() => !scanning && fileRef.current?.click()}
      >
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
        />
        {scanning ? (
          <div className="flex items-center justify-center gap-2 text-indigo-400 text-sm">
            <span className="animate-spin">⏳</span> {scanMsg}
          </div>
        ) : scanMsg ? (
          <div className="text-sm text-gray-300">{scanMsg}</div>
        ) : (
          <div>
            <div className="flex justify-center mb-1 text-gray-500 text-sm uppercase tracking-widest font-mono">SCAN</div>
            <p className="text-sm text-gray-400 font-medium">Paste screenshot (Ctrl+V) or click to upload</p>
            <p className="text-xs text-gray-600 mt-0.5">Single and express coupons are supported</p>
          </div>
        )}
      </div>

      {/* ── Bet type indicator + source ───────────────────── */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="flex gap-1 bg-gray-800 rounded-lg p-1 w-fit">
          <div className={`px-4 py-1.5 text-sm rounded-md font-medium ${!isExpress ? 'bg-indigo-600 text-white' : 'text-gray-500'}`}>
            Single
          </div>
          <div className={`px-4 py-1.5 text-sm rounded-md font-medium ${isExpress ? 'bg-indigo-600 text-white' : 'text-gray-500'}`}>
            Express{isExpress ? ` · ${legs.length} legs` : ''}
          </div>
        </div>
        {source === 'scanner' && (
          <span className="text-xs text-indigo-300 bg-indigo-950/50 border border-indigo-900 rounded-full px-2.5 py-1">
            from scanner
          </span>
        )}
      </div>

      <form onSubmit={handleSubmit} className="card flex flex-col gap-4">
        {/* ── Legs (order preserved) ──────────────────────── */}
        {legs.map((leg, index) => (
          <div key={index} className="border border-gray-800 rounded-xl p-3 sm:p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                {isExpress ? `Leg ${index + 1}` : 'Bet'}
              </span>
              {legs.length > 1 && (
                <button
                  type="button"
                  className="text-xs text-gray-500 hover:text-red-400 px-2 py-1"
                  onClick={() => removeLeg(index)}
                  aria-label={`Remove leg ${index + 1}`}
                >
                  ✕ Remove
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className="label">Event *</label>
                <input
                  className={`input w-full ${errors[`legs.${index}.event_name`] ? 'border-red-600' : ''}`}
                  placeholder="Germany vs Netherlands"
                  value={leg.event_name}
                  onChange={e => updateLeg(index, 'event_name', e.target.value)}
                />
                {errors[`legs.${index}.event_name`] && (
                  <p className="text-xs text-red-400 mt-1">{errors[`legs.${index}.event_name`]}</p>
                )}
              </div>

              <div>
                <label className="label">Market *</label>
                <input
                  className={`input w-full ${errors[`legs.${index}.market_type`] ? 'border-red-600' : ''}`}
                  placeholder="П1 / т2.5 / Ф1 +1"
                  value={leg.market_type}
                  onChange={e => updateLeg(index, 'market_type', e.target.value)}
                />
                {errors[`legs.${index}.market_type`] && (
                  <p className="text-xs text-red-400 mt-1">{errors[`legs.${index}.market_type`]}</p>
                )}
              </div>

              <div>
                <label className="label">Selection</label>
                <input
                  className="input w-full"
                  placeholder="Germany"
                  value={leg.selection}
                  onChange={e => updateLeg(index, 'selection', e.target.value)}
                />
              </div>

              <div>
                <label className="label">Odds *</label>
                <input
                  className={`input w-full ${errors[`legs.${index}.odds`] ? 'border-red-600' : ''}`}
                  type="number" step="0.0001" min="1.01" inputMode="decimal" placeholder="1.85"
                  value={leg.odds}
                  onChange={e => updateLeg(index, 'odds', e.target.value)}
                />
                {errors[`legs.${index}.odds`] && (
                  <p className="text-xs text-red-400 mt-1">{errors[`legs.${index}.odds`]}</p>
                )}
              </div>

              <div>
                <label className="label">Sport</label>
                <select
                  className="input w-full"
                  value={leg.sport}
                  onChange={e => updateLeg(index, 'sport', e.target.value)}
                >
                  {TRACKED_BET_SPORTS.map(s => (
                    <option key={s} value={s}>{SPORT_LABEL[s]}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        ))}

        {errors.legs && <p className="text-xs text-red-400">{errors.legs}</p>}

        <button
          type="button"
          className="btn-ghost w-full sm:w-fit"
          onClick={addLeg}
          disabled={legs.length >= MAX_TRACKED_BET_LEGS}
        >
          + Add leg{legs.length >= MAX_TRACKED_BET_LEGS ? ` (max ${MAX_TRACKED_BET_LEGS})` : ''}
        </button>

        {/* ── Express total odds (UI preview never submits) ── */}
        {isExpress && (
          <div>
            <label className="label">Total odds (express) *</label>
            <input
              className={`input w-full ${errors.total_odds ? 'border-red-600' : ''}`}
              type="number" step="0.0001" min="1.01" inputMode="decimal" placeholder="7.25"
              value={totalOdds}
              onChange={e => { setTotalOdds(e.target.value); clearError('total_odds') }}
            />
            {previewTotal != null && (
              <p className="text-xs text-gray-500 mt-1">
                Calculated from legs: {previewTotal} (preview only — the saved value is what you enter here)
              </p>
            )}
            {errors.total_odds && <p className="text-xs text-red-400 mt-1">{errors.total_odds}</p>}
          </div>
        )}

        {/* ── Money + meta ───────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="label">Stake *</label>
            <input
              className={`input w-full ${errors.stake ? 'border-red-600' : ''}`}
              type="number" step="0.01" min="0.01" inputMode="decimal" placeholder="50"
              value={stake}
              onChange={e => { setStake(e.target.value); clearError('stake') }}
            />
            {errors.stake && <p className="text-xs text-red-400 mt-1">{errors.stake}</p>}
          </div>

          <div>
            <label className="label">Bookmaker</label>
            <select
              className="input w-full"
              value={bookmaker}
              onChange={e => { setBookmaker(e.target.value); clearError('bookmaker') }}
            >
              <option value="">—</option>
              {BOOKMAKERS.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>

          <div className="sm:col-span-2">
            <label className="label">Notes</label>
            <textarea
              className="input w-full resize-none" rows={2} placeholder="Optional..."
              value={notes}
              onChange={e => { setNotes(e.target.value); clearError('notes') }}
            />
          </div>
        </div>

        {showPayoutPreview && (
          <div className="bg-gray-800 rounded-lg px-4 py-3 flex justify-between text-sm">
            <span className="text-gray-400">Potential payout (preview)</span>
            <span className="text-white font-semibold">{(stakeNum * effectiveTotal).toFixed(2)}</span>
          </div>
        )}

        {errors._root && (
          <div className="text-xs text-red-400 bg-red-950/40 border border-red-900 rounded-lg px-3 py-2">
            {errors._root}
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3">
          <button type="submit" className="btn-primary w-full sm:flex-1" disabled={loading}>
            {loading ? 'Saving...' : isExpress ? `Save Express (${legs.length} legs)` : 'Save Bet'}
          </button>
          <button type="button" className="btn-ghost w-full sm:w-auto" onClick={() => router.back()}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}
