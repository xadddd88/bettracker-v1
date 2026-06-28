# Sprint 7 — Bankroll & Settings

Status: Accepted ✅

---

## Goal

Replace the two "Coming in Sprint 2" stubs with functional pages. Users need a working bankroll tracker and a settings page before the product feels production-ready — and before the Risk Manager (Sprint 8) can compute meaningful exposure percentages.

---

## Why

Every page in the sidebar now does something real **except** Bankroll and Settings. This creates an embarrassing gap: the app can analyse bets, scout markets, and coach retrospective performance — but users can't see their balance, record a deposit, or change their currency.

Settings in particular is a blocker for other agents: Coach shows wrong currency, Scout ignores the user's web-search preference, and Kelly sizing uses the default fraction (0.5) regardless of what the user actually wants.

---

## What already exists (do not re-implement)

- `profiles` table — `display_name`, `currency`, `default_stake`, `kelly_fraction`, `web_search_enabled`, `timezone`; created on signup
- `bankrolls` table — `balance`, `currency`, `is_default`; default bankroll auto-created on signup via `handle_new_user()` trigger
- `bankroll_transactions` table — `type` (deposit/withdrawal/stake/payout/adjustment/bonus), `amount`, `balance_after`
- `settle_bet` RPC — already records stake/payout transactions correctly
- `POST /api/bankroll/deposit` — already handles deposits and withdrawals; **has one bug (see below)**
- All RLS policies in place

**No new DB migrations needed for Sprint 7.**

---

## Scope

### 1. Bug fix — `/api/bankroll/deposit/route.ts`

Current bug: when `note` is provided, the route spreads `{ notes: note }` into the `bankroll_transactions` insert. The column is `metadata jsonb`, not `notes`. Supabase silently drops the insert, so the transaction record is lost when a note is included.

Fix: change `...(note ? { notes: note } : {})` to `...(note ? { metadata: { note } } : {})`.

---

### 2. PATCH /api/settings

Updates the authenticated user's profile. All fields optional; only provided fields are updated.

**Request:**
```ts
{
  display_name?:      string     // max 50 chars
  currency?:          'USD' | 'EUR' | 'UAH' | 'GBP' | 'CAD' | 'AUD'
  default_stake?:     number     // 0.01 – 100 000
  kelly_fraction?:    number     // 0.1 – 1.0 (step 0.05 in UI, any value in API)
  web_search_enabled?: boolean
  timezone?:          string     // max 100 chars; IANA or freeform
}
```

**Response:**
```ts
{ success: true; data: Profile }
```

When `currency` is updated, also update `bankrolls.currency` on the user's default bankroll (keeps analytics page in sync — it reads from bankrolls, not profiles).

No rate limiting needed (low-frequency operation).

PostHog: `settings_saved` with `{ fields_changed: string[] }` — only field names, never values.

---

### 3. /settings page

Server component fetches the current profile, passes to `SettingsForm` client component.

If profile is missing (edge case), show an error state.

**Layout:**

```
Settings
─────────────────────────────────────
Profile
  Display name  [text input]

Currency & Bankroll
  Currency      [USD | EUR | UAH | GBP | CAD | AUD selector]
                ⚠ Changing currency does not convert your balance.
  Default stake [number input, min 0.01]

AI & Analysis
  Kelly fraction  [slider 0.1x → 1.0x, step 0.05, show current value]
  Web search      [toggle]
                  Enable live web search in Scout. Requires server
                  activation — contact your admin if Scout ignores this.

Account
  Email  [read-only, from auth.users]
  Timezone [text input, placeholder 'UTC']

[Save settings]   ← one button, saves all changed fields
```

States:
- Default: form pre-filled from server-fetched profile
- Saving: button disabled, "Saving…"
- Success: "Settings saved" toast/inline (3s, then clear)
- Error: error message inline

---

### 4. Wire `web_search_enabled` into Scout

Currently Scout reads only `process.env.ANTHROPIC_WEB_SEARCH_ENABLED`. After this sprint, the logic is:

```ts
// In /api/scout/route.ts — POST handler
const profile = await supabase.from('profiles').select('web_search_enabled').eq('id', user.id).single()
const globalEnabled = process.env.ANTHROPIC_WEB_SEARCH_ENABLED === 'true'
const webSearchEnabled = globalEnabled && (profile.data?.web_search_enabled ?? false)
```

The env var remains a global kill switch. The profile preference is per-user. Both must be true for web search to activate.

---

### 5. /bankroll page

Server component fetches bankroll + transactions + profile (for currency). Passes to `BankrollView` client component.

If no default bankroll found, show an error state (should never happen post-signup, but guard it).

**Layout (top to bottom):**

```
Bankroll

Current Balance
[big number with currency symbol]    e.g.  €1 240.50

[Total deposited]  [Total withdrawn]  [Net from bets]
  €2 000.00          €500.00           -€259.50

[+ Deposit]  [− Withdraw]

Transaction history  (last 50 transactions)
───────────────────────────────────────────
↑ Deposit       +€500.00   Balance: €1 500.00   Jun 28
↓ Withdrawal    -€200.00   Balance: €1 300.00   Jun 27
● Stake         -€25.00    Balance: €1 325.00   Jun 26
✓ Payout        +€47.50    Balance: €1 350.00   Jun 25
...
```

**+ Deposit / − Withdraw:** clicking opens an inline form below the buttons (not a modal). Form has an amount input, optional note field (max 200 chars), and a confirm button. Closes after success or via a cancel link.

**Stats computation (server-side from transactions):**
```ts
total_deposited  = sum(amount) where type='deposit'
total_withdrawn  = abs(sum(amount)) where type='withdrawal'
net_from_bets    = sum(amount) where type in ('stake', 'payout')
```

**Transaction row type indicators:**

| type       | icon | color              |
|------------|------|--------------------|
| deposit    | ↑    | text-green-400     |
| withdrawal | ↓    | text-red-400       |
| stake      | ●    | text-gray-400      |
| payout     | ✓    | text-green-400     |
| adjustment | ±    | text-gray-400      |
| bonus      | ★    | text-indigo-400    |

Empty state (no transactions): "No transactions yet. Make your first deposit to get started." with a prominent Deposit button.

PostHog:
- `deposit_recorded`: `{ amount_bucket }` where bucket = `small (<50) | medium (50–500) | large (>500)`
- `withdrawal_recorded`: `{ amount_bucket }` same thresholds

---

### 6. Analytics page — use profile currency

Currently analytics fetches currency from `bankrolls.currency`. After Sprint 7 wires the settings page (which syncs both), this remains correct. No change needed to analytics.

---

### 7. PostHog events

Add to `lib/analytics/events.ts`:
```ts
SETTINGS_PAGE_VIEWED:  'settings_page_viewed',
SETTINGS_SAVED:        'settings_saved',
BANKROLL_PAGE_VIEWED:  'bankroll_page_viewed',
DEPOSIT_RECORDED:      'deposit_recorded',
WITHDRAWAL_RECORDED:   'withdrawal_recorded',
```

`SETTINGS_PAGE_VIEWED` — via `<PageView>` in `settings/page.tsx`
`BANKROLL_PAGE_VIEWED` — via `<PageView>` in `bankroll/page.tsx`
`SETTINGS_SAVED` — fires in `PATCH /api/settings` on success; payload: `{ fields_changed: string[] }`
`DEPOSIT_RECORDED` — fires in `/api/bankroll/deposit` on success; payload: `{ amount_bucket: string }`
`WITHDRAWAL_RECORDED` — same

---

## Implementation preferences

- `settings/page.tsx` (server) → fetch profile → render `<SettingsForm profile={profile} />`
- `settings/SettingsForm.tsx` (client) — all form state, PATCH on save, inline success/error
- `bankroll/page.tsx` (server) → fetch bankroll + transactions + profile in parallel → render `<BankrollView>`
- `BankrollView.tsx` (client) — handles deposit/withdraw form state, POST, optimistic balance update
- No chart in Sprint 7 — clean tabular list is sufficient and avoids adding a chart library
- Currency symbols: `$` (USD), `€` (EUR), `₴` (UAH), `£` (GBP), `CA$` (CAD), `A$` (AUD)
- Scout route change is a one-function patch, not a full rewrite — fetch profile and compute `webSearchEnabled` at the top of the POST handler
- Optimistic UI for deposit/withdraw: update displayed balance and prepend transaction row immediately on success, without waiting for a page refresh

---

## Validation

- `npm run lint`
- `npm run build`
- Smoke test:
  - Settings: load page (pre-filled), change currency to UAH, save, reload — verify form shows UAH, analytics shows ₴
  - Bankroll: deposit 100, verify balance updates, transaction appears in list
  - Bankroll: withdraw 50, verify balance updates
  - Bankroll: withdraw 9999 (over balance), verify 422 error shown
  - Scout: with `web_search_enabled = false` in settings, verify Scout skips web search even if env var is true

---

## Acceptance Criteria

**Settings**
- [ ] `PATCH /api/settings` authenticated, Zod-validated, partial update (only provided fields)
- [ ] Currency change syncs to default bankroll
- [ ] `settings_saved` event fires with `fields_changed` array, no values
- [ ] `/settings` page loads pre-filled from server-fetched profile
- [ ] All six fields editable: display_name, currency, default_stake, kelly_fraction, web_search_enabled, timezone
- [ ] Kelly slider shows current value, step 0.05
- [ ] Save button shows loading state, success message on completion
- [ ] `SETTINGS_PAGE_VIEWED` fires

**Bankroll**
- [ ] `/bankroll` page loads with current balance and transaction history
- [ ] Deposit form records transaction, updates displayed balance optimistically
- [ ] Withdraw form records transaction, updates displayed balance optimistically
- [ ] Withdraw over balance returns 422, shown as inline error
- [ ] Stats (deposited / withdrawn / net from bets) computed correctly from transactions
- [ ] Transaction history shows last 50, ordered newest first
- [ ] Empty state shown when no transactions
- [ ] `deposit_recorded` / `withdrawal_recorded` fire with bucketed amount
- [ ] `BANKROLL_PAGE_VIEWED` fires
- [ ] Bug fix: deposit route saves transaction correctly when note is provided

**Scout integration**
- [ ] Scout reads `web_search_enabled` from profile (with global env var as kill switch)
- [ ] Disabling web search in settings causes Scout to skip web search regardless of env var

---

## Non-Scope (Sprint 7)

- Multiple bankrolls / bankroll switching
- Currency conversion when changing currency
- Balance history chart / equity curve
- Bankroll import/export
- Automated low-balance alerts
- Timezone-aware date formatting across the app (just store the value in Sprint 7)
- Risk Manager (Sprint 8)
