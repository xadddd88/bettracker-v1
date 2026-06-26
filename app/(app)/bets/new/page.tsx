'use client'

import { useState, useCallback, useRef } from 'react'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import type { Sport } from '@/types'

const SPORTS: Sport[] = ['football', 'tennis', 'basketball', 'hockey', 'other']
const BOOKMAKERS = ['Bet365', 'William Hill', '1xBet', 'Stake', 'Pinnacle', 'Other']

// ─── Validation schema ───────────────────────────────────────
const quickBetSchema = z.object({
  event_name:  z.string().min(1, 'Event name is required'),
  market_type: z.string().min(1, 'Market is required'),
  selection:   z.string().optional(),
  odds:        z.number({ invalid_type_error: 'Odds must be a number' }).min(1.01, 'Odds must be > 1.00'),
  stake:       z.number({ invalid_type_error: 'Stake must be a number' }).positive('Stake must be positive'),
  sport:       z.enum(['football', 'tennis', 'basketball', 'hockey', 'other']),
  bookmaker:   z.string().nullable().optional(),
  notes:       z.string().nullable().optional(),
})

type FormErrors = Partial<Record<keyof z.infer<typeof quickBetSchema> | '_root', string>>

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
  const router   = useRouter()
  const supabase = createClient()
  const fileRef  = useRef<HTMLInputElement>(null)

  const [loading,  setLoading]  = useState(false)
  const [scanning, setScanning] = useState(false)
  const [scanMsg,  setScanMsg]  = useState('')
  const [errors,   setErrors]   = useState<FormErrors>({})

  const [form, setForm] = useState({
    event_name:  '',
    market_type: '',
    selection:   '',
    odds:        '',
    stake:       '',
    sport:       'football' as Sport,
    bookmaker:   '',
    notes:       '',
  })

  function set(field: string, value: unknown) {
    setForm(f => ({ ...f, [field]: value }))
    setErrors(e => ({ ...e, [field]: undefined }))
  }

  // ── Scanner ────────────────────────────────────────────────
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

      const d = json.data
      setForm(prev => ({
        ...prev,
        event_name:  d.event_name  ?? prev.event_name,
        market_type: d.market_type ?? prev.market_type,
        selection:   d.selection   ?? prev.selection,
        odds:        d.odds != null ? String(d.odds) : prev.odds,
        stake:       d.stake != null ? String(d.stake) : prev.stake,
        sport:       (SPORTS.includes(d.sport) ? d.sport : prev.sport) as Sport,
        bookmaker:   d.bookmaker   ?? prev.bookmaker,
      }))
      setScanMsg('✅ Coupon scanned — review and save')

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

    const parsed = quickBetSchema.safeParse({
      ...form,
      odds:      form.odds  ? parseFloat(form.odds)  : undefined,
      stake:     form.stake ? parseFloat(form.stake) : undefined,
      bookmaker: form.bookmaker || null,
      notes:     form.notes     || null,
    })

    if (!parsed.success) {
      const fieldErrors: FormErrors = {}
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof FormErrors
        fieldErrors[key] = issue.message
      }
      setErrors(fieldErrors)
      return
    }

    setLoading(true)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const { data: bankroll } = await supabase
        .from('bankrolls')
        .select('id')
        .eq('user_id', user.id)
        .eq('is_default', true)
        .single()

      const { error: rpcErr } = await supabase.rpc('create_quick_bet', {
        p_user_id:      user.id,
        p_bankroll_id:  bankroll?.id ?? null,
        p_event_name:   parsed.data.event_name,
        p_sport:        parsed.data.sport,
        p_market_type:  parsed.data.market_type,
        p_selection:    parsed.data.selection ?? null,
        p_offered_odds: parsed.data.odds,
        p_stake:        parsed.data.stake,
        p_bookmaker:    parsed.data.bookmaker ?? null,
        p_notes:        parsed.data.notes ?? null,
      })

      if (rpcErr) throw rpcErr

      router.push('/bets')
      router.refresh()

    } catch (err: unknown) {
      setErrors({ _root: err instanceof Error ? err.message : 'Something went wrong' })
    } finally {
      setLoading(false)
    }
  }

  const oddsNum  = parseFloat(form.odds)
  const stakeNum = parseFloat(form.stake)
  const showPreview = !isNaN(oddsNum) && !isNaN(stakeNum) && oddsNum > 1 && stakeNum > 0

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
            <div className="text-2xl mb-1">📸</div>
            <p className="text-sm text-gray-400 font-medium">Paste screenshot (Ctrl+V) or click to upload</p>
            <p className="text-xs text-gray-600 mt-0.5">Coupon will be scanned automatically</p>
          </div>
        )}
      </div>

      {/* Bet type */}
      <div className="flex gap-1 bg-gray-800 rounded-lg p-1 mb-4 w-fit">
        <div className="px-4 py-1.5 text-sm rounded-md font-medium bg-indigo-600 text-white">Single</div>
        <div className="px-4 py-1.5 text-sm rounded-md text-gray-600 cursor-not-allowed" title="Coming in Sprint 2">Parlay</div>
      </div>

      <form onSubmit={handleSubmit} className="card flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="label">Event *</label>
            <input
              className={`input ${errors.event_name ? 'border-red-600' : ''}`}
              placeholder="Germany vs Netherlands"
              value={form.event_name}
              onChange={e => set('event_name', e.target.value)}
            />
            {errors.event_name && <p className="text-xs text-red-400 mt-1">{errors.event_name}</p>}
          </div>

          <div>
            <label className="label">Market *</label>
            <input
              className={`input ${errors.market_type ? 'border-red-600' : ''}`}
              placeholder="П1 / ТБ 2.5 / Ф1 +1"
              value={form.market_type}
              onChange={e => set('market_type', e.target.value)}
            />
            {errors.market_type && <p className="text-xs text-red-400 mt-1">{errors.market_type}</p>}
          </div>

          <div>
            <label className="label">Selection</label>
            <input
              className="input"
              placeholder="Germany"
              value={form.selection}
              onChange={e => set('selection', e.target.value)}
            />
          </div>

          <div>
            <label className="label">Odds *</label>
            <input
              className={`input ${errors.odds ? 'border-red-600' : ''}`}
              type="number" step="0.01" min="1.01" placeholder="1.85"
              value={form.odds}
              onChange={e => set('odds', e.target.value)}
            />
            {errors.odds && <p className="text-xs text-red-400 mt-1">{errors.odds}</p>}
          </div>

          <div>
            <label className="label">Stake *</label>
            <input
              className={`input ${errors.stake ? 'border-red-600' : ''}`}
              type="number" step="0.01" min="0.01" placeholder="50"
              value={form.stake}
              onChange={e => set('stake', e.target.value)}
            />
            {errors.stake && <p className="text-xs text-red-400 mt-1">{errors.stake}</p>}
          </div>

          <div>
            <label className="label">Sport</label>
            <select className="input" value={form.sport} onChange={e => set('sport', e.target.value)}>
              {SPORTS.map(s => (
                <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="label">Bookmaker</label>
            <select className="input" value={form.bookmaker} onChange={e => set('bookmaker', e.target.value)}>
              <option value="">—</option>
              {BOOKMAKERS.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>

          <div className="col-span-2">
            <label className="label">Notes</label>
            <textarea
              className="input resize-none" rows={2} placeholder="Optional..."
              value={form.notes}
              onChange={e => set('notes', e.target.value)}
            />
          </div>
        </div>

        {showPreview && (
          <div className="bg-gray-800 rounded-lg px-4 py-3 flex justify-between text-sm">
            <span className="text-gray-400">Potential payout</span>
            {/* TODO: currency from bankroll.currency */}
            <span className="text-white font-semibold">${(stakeNum * oddsNum).toFixed(2)}</span>
          </div>
        )}

        {errors._root && (
          <div className="text-xs text-red-400 bg-red-950/40 border border-red-900 rounded-lg px-3 py-2">
            {errors._root}
          </div>
        )}

        <div className="flex gap-3">
          <button type="submit" className="btn-primary flex-1" disabled={loading}>
            {loading ? 'Saving...' : 'Save Bet'}
          </button>
          <button type="button" className="btn-ghost" onClick={() => router.back()}>Cancel</button>
        </div>
      </form>
    </div>
  )
}
