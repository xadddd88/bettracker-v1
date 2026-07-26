export type TennisSeriesStatus =
  | 'draft'
  | 'active'
  | 'completed_win'
  | 'stopped'
  | 'limit_reached'
  | 'cancelled'

export type TennisStepStatus = 'confirmed' | 'won' | 'lost' | 'void'

export interface TennisStepSnapshot {
  id: string
  step_number: number
  set_number: number | null
  game_number: number | null
  quoted_odds: string
  recommended_stake: string
  accepted_odds: string
  accepted_stake: string
  actual_return: string | null
  status: TennisStepStatus
  loss_before: string
  target_profit_snapshot: string
  projected_series_result: string
  confirmed_at: string
  settled_at: string | null
}

export interface TennisSeriesSnapshot {
  id: string
  status: TennisSeriesStatus
  target_profit: string
  initial_stake: string | null
  stake_increment: string
  currency_or_unit: string
  bankroll_limit: string
  maximum_stake: string | null
  maximum_steps: number
  exposure_limit: string
  formula_version: string
  version: number
  match_label: string | null
  created_at: string
  closed_at: string | null
  steps: TennisStepSnapshot[]
}
