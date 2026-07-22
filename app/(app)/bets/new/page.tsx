'use client'

import { useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { BroadcastDataValue, BroadcastStatus } from '@/components/ui/BroadcastNoir'
import {
  TRACKED_BET_SPORTS,
  MAX_TRACKED_BET_LEGS,
  trackedBetFormSchema,
  draftsToRequestLegs,
  computeExpressPreviewTotal,
  scannerDataToDrafts,
  emptyLegDraft,
  switchLegDraftMode,
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

  // Synchronous scan lock (Decision #061 Phase A1). React state is
  // async and stale inside useCallback closures, so the busy guards
  // read refs: scanningRef for scans, intentRef.status === 'in_flight'
  // for financial submits. The `busy` value below is the render mirror
  // that disables the whole form via <fieldset disabled>.
  const scanningRef = useRef(false)

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

  // Decision #061 Phase A1: after a refused oversized coupon the form
  // still holds the PREVIOUS draft — saving it would bet on the wrong
  // coupon. While true, handleSubmit refuses before validation, before
  // any UUID is minted and before any network call. A later valid scan
  // clears it; a deliberate manual payload edit clears it too but
  // switches source to manual (the draft stops being a scanner import).
  const [scannerOverflowBlocked, setScannerOverflowBlocked] = useState(false)

  const isExpress    = legs.length >= 2
  const previewTotal = computeExpressPreviewTotal(legs)

  // Decision #061 Phase A1 busy lock: while a financial submit is in
  // flight OR a scan is running, the whole draft is read-only — no
  // edits, no leg mutations, no re-scan, no Cancel, no second Save.
  // The financial fetch itself is NEVER cancelled: on a network-
  // unknown result the intent machine keeps the UUID and snapshot.
  const busy = loading || scanning

  function clearError(key: string) {
    setErrors(e => ({ ...e, [key]: undefined, _root: undefined }))
  }

  // Every manual payload edit funnels through here: it clears the
  // field error and — if an oversized coupon was just refused — lifts
  // the overflow block, taking manual ownership of the draft.
  function markManualEdit(key: string) {
    clearError(key)
    if (scannerOverflowBlocked) {
      setScannerOverflowBlocked(false)
      setSource('manual')
      setScanMsg('')
    }
  }

  // ── Leg operations (array order IS the leg order) ──────────
  function updateLeg(index: number, field: keyof LegDraft, value: string) {
    setLegs(current => current.map((leg, i) => (i === index ? { ...leg, [field]: value } : leg)))
    markManualEdit(`legs.${index}.${field}`)
  }

  function addLeg() {
    setLegs(current =>
      current.length >= MAX_TRACKED_BET_LEGS
        ? current
        : [...current, emptyLegDraft(current[current.length - 1]?.sport ?? 'soccer')]
    )
    markManualEdit('legs')
  }

  function removeLeg(index: number) {
    setLegs(current => (current.length <= 1 ? current : current.filter((_, i) => i !== index)))
    markManualEdit('legs')
  }

  function selectBetMode(mode: 'single' | 'express') {
    if (busy) return
    if (mode === 'single' && legs.length > 1) {
      const confirmed = window.confirm('Switch to Single and remove the additional Express legs?')
      if (!confirmed) return
      setTotalOdds('')
    }
    setLegs(current => switchLegDraftMode(current, mode))
    markManualEdit('legs')
  }

  // ── Scanner (existing OCR flow; recognized legs become editable) ──
  const runScanner = useCallback(async (file: File) => {
    // Busy guard (synchronous): never start a scan while a financial
    // submit is in flight or another scan is running.
    if (scanningRef.current || intentRef.current.status === 'in_flight') return
    scanningRef.current = true
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
      // FAIL CLOSED (Decision #061 Phase A1): the ok check runs BEFORE
      // any draft state is applied. An oversized coupon imports
      // NOTHING — legs, total odds, stake, bookmaker and source all
      // stay exactly as they were — and the overflow gate locks Save,
      // so the leftover draft cannot be submitted as the wrong bet.
      // The fixed message never echoes coupon content or a leg count.
      const mapped = scannerDataToDrafts(json.data)
      if (!mapped.ok) {
        setScannerOverflowBlocked(true)
        setScanMsg('Coupon has more than 20 legs and was not imported.')
        return
      }
      // Full-replacement policy: a successful scan replaces EVERY
      // scanner-derived field and lifts the overflow gate. Absent
      // values arrive as empty strings and clear stale ones from the
      // previous coupon — nothing carries over. Notes are user-owned
      // manual input and are deliberately kept.
      setLegs(mapped.legs)
      setTotalOdds(mapped.totalOdds)
      setStake(mapped.stake)
      setBookmaker(mapped.bookmaker)
      setSource('scanner')
      setScannerOverflowBlocked(false)
      setErrors({})
      setScanMsg(
        mapped.legs.length >= 2
          ? `✅ Express scanned — ${mapped.legs.length} legs. Review and save`
          : '✅ Coupon scanned — review and save'
      )
    } catch {
      setScanMsg('Scan error — try again')
    } finally {
      scanningRef.current = false
      setScanning(false)
    }
  }, [])

  // Ctrl+V paste
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    // Busy guard: pasting a screenshot must not start a scan while a
    // financial submit is in flight or another scan is running.
    if (scanningRef.current || intentRef.current.status === 'in_flight') return
    const items = Array.from(e.clipboardData.items)
    const imageItem = items.find(i => i.type.startsWith('image/'))
    if (imageItem) {
      const file = imageItem.getAsFile()
      if (file) runScanner(file)
    }
  }, [runScanner])

  // File picker
  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (scanningRef.current || intentRef.current.status === 'in_flight') {
      e.target.value = ''
      return
    }
    const file = e.target.files?.[0]
    if (file) runScanner(file)
    e.target.value = ''
  }, [runScanner])

  // ── Submit ─────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    // Busy guard: the draft cannot be submitted while a scan is
    // rewriting it. In-flight financial submits are blocked by the
    // intent machine below; the fetch itself is never cancelled.
    if (scanningRef.current) return
    // Overflow gate (Decision #061 Phase A1): checked BEFORE
    // validation, before any UUID is minted and before any network
    // call. After a refused oversized coupon, zero requests leave
    // this page and the fixed refusal message stays visible until a
    // valid scan or a deliberate manual edit unlocks the draft.
    if (scannerOverflowBlocked) return
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
    <main className="bn-page mx-auto w-full max-w-3xl space-y-4 pb-8" onPaste={handlePaste}>
      <header className="bn-panel p-5 sm:p-7">
        <p className="editorial-kicker">Tracker · editable draft</p>
        <h1 className="mt-3 font-display text-[clamp(2.75rem,8vw,5.5rem)] font-black leading-none tracking-[-0.06em] text-bn-text">Add bet</h1>
        <p className="mt-4 max-w-xl text-sm leading-6 text-bn-muted">
          Paste a screenshot or enter the coupon manually. Nothing is saved until you press Save.
        </p>
      </header>

      <label
        aria-busy={busy}
        aria-disabled={busy}
        className={`bn-panel block border-2 border-dashed px-5 py-7 text-center transition-colors ${
          scanning
            ? 'border-bn-signal bg-bn-raised'
            : busy
              ? 'cursor-not-allowed border-bn-border-subtle opacity-60'
              : 'cursor-pointer hover:border-bn-signal hover:bg-bn-raised'
        }`}
        htmlFor="coupon-image"
      >
        <input
          ref={fileRef}
          id="coupon-image"
          type="file"
          accept="image/*"
          className="sr-only"
          disabled={busy}
          onChange={handleFileChange}
        />
        {scanning ? (
          <div className="flex items-center justify-center gap-2 text-sm font-semibold text-bn-signal">
            <span aria-hidden="true">•</span> {scanMsg}
          </div>
        ) : scanMsg ? (
          <div aria-live="polite" className="text-sm text-bn-text">{scanMsg}</div>
        ) : (
          <div>
            <div className="font-mono text-[11px] font-black uppercase tracking-[0.12em] text-bn-quiet">Capture coupon</div>
            <p className="mt-2 text-sm font-semibold text-bn-text">Paste screenshot (Ctrl+V) or choose an image</p>
            <p className="mt-1 text-xs text-bn-muted">Single and Express coupons are supported</p>
          </div>
        )}
      </label>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex w-full gap-1 rounded-control border border-bn-border-strong bg-bn-field p-1 min-[420px]:w-fit" role="group" aria-label="Bet type">
          <button
            type="button"
            aria-pressed={!isExpress}
            disabled={busy}
            onClick={() => selectBetMode('single')}
            className={`min-h-11 flex-1 rounded-control px-4 text-sm font-black disabled:opacity-50 min-[420px]:flex-none ${!isExpress ? 'bg-bn-signal text-bn-on-signal' : 'text-bn-muted'}`}
          >
            Single
          </button>
          <button
            type="button"
            aria-pressed={isExpress}
            disabled={busy}
            onClick={() => selectBetMode('express')}
            className={`min-h-11 flex-1 rounded-control px-4 text-sm font-black disabled:opacity-50 min-[420px]:flex-none ${isExpress ? 'bg-bn-signal text-bn-on-signal' : 'text-bn-muted'}`}
          >
            Express{isExpress ? ` · ${legs.length}` : ''}
          </button>
        </div>
        {source === 'scanner' ? <BroadcastStatus status="review">Scanner draft · review required</BroadcastStatus> : null}
      </div>

      <form onSubmit={handleSubmit} className="bn-panel flex flex-col gap-4 p-4 sm:p-6" aria-busy={busy}>
        {/* Decision #061 Phase A1: ONE native disabled boundary. While
            a scan or a financial submit is running, every input, select,
            textarea and button inside — leg fields, Add leg, Remove leg,
            Cancel and Save — is disabled at once by the browser itself,
            so no individual control can be forgotten. display:contents
            keeps the children in the form's flex layout unchanged. */}
        <fieldset disabled={busy} className="contents">
        {/* ── Legs (order preserved) ──────────────────────── */}
        {legs.map((leg, index) => (
          <section key={index} aria-label={isExpress ? `Leg ${index + 1}` : 'Single bet'} className="flex flex-col gap-3 rounded-control border border-bn-border-strong bg-bn-night p-3 sm:p-4">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[11px] font-black uppercase tracking-[0.08em] text-bn-muted">
                {isExpress ? `Leg ${index + 1}` : 'Bet'}
              </span>
              {legs.length > 1 && (
                <button
                  type="button"
                  className="bn-button bn-button-destructive px-3"
                  onClick={() => removeLeg(index)}
                  aria-label={`Remove leg ${index + 1}`}
                  disabled={busy}
                >
                  Remove
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className="label">Event *</label>
                <input
                  className={`input w-full ${errors[`legs.${index}.event_name`] ? '!border-bn-negative' : ''}`}
                  placeholder="Germany vs Netherlands"
                  value={leg.event_name}
                  onChange={e => updateLeg(index, 'event_name', e.target.value)}
                />
                {errors[`legs.${index}.event_name`] && (
                  <p className="mt-1 text-xs text-bn-negative">{errors[`legs.${index}.event_name`]}</p>
                )}
              </div>

              <div>
                <label className="label">Market *</label>
                <input
                  className={`input w-full ${errors[`legs.${index}.market_type`] ? '!border-bn-negative' : ''}`}
                  placeholder="П1 / т2.5 / Ф1 +1"
                  value={leg.market_type}
                  onChange={e => updateLeg(index, 'market_type', e.target.value)}
                />
                {errors[`legs.${index}.market_type`] && (
                  <p className="mt-1 text-xs text-bn-negative">{errors[`legs.${index}.market_type`]}</p>
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
                  className={`input w-full ${errors[`legs.${index}.odds`] ? '!border-bn-negative' : ''}`}
                  type="number" step="0.0001" min="1.01" inputMode="decimal" placeholder="1.85"
                  value={leg.odds}
                  onChange={e => updateLeg(index, 'odds', e.target.value)}
                />
                {errors[`legs.${index}.odds`] && (
                  <p className="mt-1 text-xs text-bn-negative">{errors[`legs.${index}.odds`]}</p>
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
          </section>
        ))}

        {errors.legs && <p className="text-xs text-bn-negative">{errors.legs}</p>}

        <button
          type="button"
          className="btn-ghost w-full sm:w-fit"
          onClick={addLeg}
          disabled={busy || legs.length >= MAX_TRACKED_BET_LEGS}
        >
          + Add leg{legs.length >= MAX_TRACKED_BET_LEGS ? ` (max ${MAX_TRACKED_BET_LEGS})` : ''}
        </button>

        {/* ── Express total odds (UI preview never submits) ── */}
        {isExpress && (
          <div>
            <label className="label">Total odds (express) *</label>
            <input
              className={`input w-full ${errors.total_odds ? '!border-bn-negative' : ''}`}
              type="number" step="0.0001" min="1.01" inputMode="decimal" placeholder="7.25"
              value={totalOdds}
              onChange={e => { setTotalOdds(e.target.value); markManualEdit('total_odds') }}
            />
            {previewTotal != null && (
              <p className="mt-1 text-xs leading-5 text-bn-muted">
                Calculated from legs: {previewTotal} (preview only — the saved value is what you enter here)
              </p>
            )}
            {errors.total_odds && <p className="mt-1 text-xs text-bn-negative">{errors.total_odds}</p>}
          </div>
        )}

        {/* ── Money + meta ───────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="label">Stake *</label>
            <input
              className={`input w-full ${errors.stake ? '!border-bn-negative' : ''}`}
              type="number" step="0.01" min="0.01" inputMode="decimal" placeholder="50"
              value={stake}
              onChange={e => { setStake(e.target.value); markManualEdit('stake') }}
            />
            {errors.stake && <p className="mt-1 text-xs text-bn-negative">{errors.stake}</p>}
          </div>

          <div>
            <label className="label">Bookmaker</label>
            <select
              className="input w-full"
              value={bookmaker}
              onChange={e => { setBookmaker(e.target.value); markManualEdit('bookmaker') }}
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
              onChange={e => { setNotes(e.target.value); markManualEdit('notes') }}
            />
          </div>
        </div>

        {showPayoutPreview && (
          <div className="flex justify-between gap-4 rounded-control border border-bn-border-subtle bg-bn-raised px-4 py-3 text-sm">
            <span className="text-bn-muted">Potential payout · preview only</span>
            <BroadcastDataValue className="font-black">{(stakeNum * effectiveTotal).toFixed(2)}</BroadcastDataValue>
          </div>
        )}

        {errors._root && (
          <div aria-live="polite" className="rounded-control border border-bn-negative px-3 py-3">
            <BroadcastStatus status="negative">{errors._root}</BroadcastStatus>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3">
          <button type="submit" className="bn-button bn-button-primary w-full sm:flex-1" disabled={busy}>
            {loading ? 'Saving...' : isExpress ? `Save Express (${legs.length} legs)` : 'Save Bet'}
          </button>
          <button
            type="button"
            className="bn-button bn-button-secondary w-full sm:w-auto"
            onClick={() => router.back()}
            disabled={busy}
          >
            Cancel
          </button>
        </div>
        </fieldset>
      </form>
    </main>
  )
}
