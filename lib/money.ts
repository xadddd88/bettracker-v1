// Shared money formatting (Decision #047 — CPO audit item 7:
// negative P&L lost its minus sign; linked-bet stake hardcoded '$').

export const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$', EUR: '€', UAH: '₴', GBP: '£', CAD: 'CA$', AUD: 'A$',
}

export function currencySymbol(code: string | null | undefined): string {
  if (!code) return '$'
  return CURRENCY_SYMBOLS[code] ?? code
}

export function fmtPnl(v: number, sym: string): string {
  const sign = v > 0 ? '+' : v < 0 ? '-' : ''
  return `${sign}${sym}${Math.abs(v).toFixed(2)}`
}

export function fmtPct(v: number): string {
  return `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`
}
