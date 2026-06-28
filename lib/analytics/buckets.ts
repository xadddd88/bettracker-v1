export function bucketStake(stake: number): string {
  if (stake < 5)   return '<5'
  if (stake < 10)  return '5-10'
  if (stake < 25)  return '10-25'
  if (stake < 50)  return '25-50'
  if (stake < 100) return '50-100'
  if (stake < 250) return '100-250'
  return '250+'
}

export function bucketOdds(odds: number): string {
  if (odds < 1.20) return '<1.20'
  if (odds < 1.50) return '1.20-1.50'
  if (odds < 2.00) return '1.50-2.00'
  if (odds < 3.00) return '2.00-3.00'
  if (odds < 5.00) return '3.00-5.00'
  return '5.00+'
}

export function bucketPnl(pnl: number): string {
  if (pnl < -100) return '<-100'
  if (pnl < -50)  return '-100 to -50'
  if (pnl < 0)    return '-50 to 0'
  if (pnl < 50)   return '0 to 50'
  if (pnl < 100)  return '50 to 100'
  return '100+'
}

export function bucketEdge(edge: number): string {
  if (edge < -5)  return '<-5%'
  if (edge < 0)   return '-5% to 0%'
  if (edge < 3)   return '0% to 3%'
  if (edge < 7)   return '3% to 7%'
  if (edge < 15)  return '7% to 15%'
  return '15%+'
}

export function bucketConfidence(confidence: number): string {
  if (confidence < 40) return 'low'
  if (confidence < 65) return 'medium'
  if (confidence < 80) return 'high'
  return 'very_high'
}

export function bucketScoutScore(score: number): string {
  if (score < 40) return 'low'
  if (score < 70) return 'medium'
  return 'high'
}

export function bucketAmount(amount: number): 'small' | 'medium' | 'large' {
  if (amount < 50)   return 'small'
  if (amount <= 500) return 'medium'
  return 'large'
}

export function bucketCount(count: number): string {
  if (count === 0)  return '0'
  if (count <= 5)   return '1-5'
  if (count <= 20)  return '6-20'
  if (count <= 50)  return '21-50'
  if (count <= 100) return '51-100'
  return '100+'
}
