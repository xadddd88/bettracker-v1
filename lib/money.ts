// Shared money formatting (Decision #047 — CPO audit item 7:
// negative P&L lost its minus sign; linked-bet stake hardcoded '$').
//
// The explicit locale keeps server and browser output byte-for-byte stable
// during hydration. Symbols stay product-defined so CAD/AUD remain
// unambiguous while UAH keeps the familiar narrow symbol.

export const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$', EUR: '€', UAH: '₴', GBP: '£', CAD: 'CA$', AUD: 'A$',
}

export const MONEY_LOCALE = 'en-US'

const MONEY_NUMBER_FORMATTER = new Intl.NumberFormat(MONEY_LOCALE, {
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
})

export function currencySymbol(code: string | null | undefined): string {
  if (!code) return '$'
  return CURRENCY_SYMBOLS[code] ?? code
}

export function formatMoneyAmount(value: number): string {
  return MONEY_NUMBER_FORMATTER.format(Math.abs(value))
}

export function formatMoney(value: number, currency = 'USD', showPositive = false): string {
  const sign = value < 0 ? '-' : showPositive && value > 0 ? '+' : ''
  return `${sign}${currencySymbol(currency)}${formatMoneyAmount(value)}`
}

export function fmtPnl(v: number, sym: string): string {
  const sign = v > 0 ? '+' : v < 0 ? '-' : ''
  return `${sign}${sym}${formatMoneyAmount(v)}`
}

export function fmtPct(v: number): string {
  return `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`
}
