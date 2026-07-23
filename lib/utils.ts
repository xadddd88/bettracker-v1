import { formatMoney } from './money'

export function cn(...classes: (string | undefined | false | null)[]) {
  return classes.filter(Boolean).join(' ')
}

export function formatCurrency(amount: number, currency = 'USD') {
  return formatMoney(amount, currency)
}

export function formatOdds(odds: number) {
  return odds.toFixed(2)
}

export function calcProfit(stake: number, odds: number, status: string) {
  if (status === 'won') return stake * (odds - 1)
  if (status === 'lost') return -stake
  if (status === 'void') return 0
  return null
}
