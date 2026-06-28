// ─── ENUMS ──────────────────────────────────────────────────
// Canonical sport codes — never localized labels in the data layer
export type SportCode = 'soccer' | 'tennis' | 'cs2' | 'basketball' | 'ice_hockey' | 'mma' | 'other'
/** @deprecated Use SportCode */
export type Sport = 'football' | 'tennis' | 'basketball' | 'hockey' | 'other'

export type BetType = 'single' | 'parlay' | 'system'
export type BetStatus = 'pending' | 'won' | 'lost' | 'void' | 'push' | 'cashed_out' | 'partial'
export type LegStatus = 'pending' | 'won' | 'lost' | 'void' | 'push'
export type FinalAction = 'pending' | 'placed' | 'skipped' | 'watchlisted' | 'ignored'
export type Recommendation = 'bet' | 'skip' | 'watch' | 'no_value'
export type RiskLevel = 'low' | 'medium' | 'high'
export type DecisionSource = 'ai_analyst' | 'scanner' | 'scout' | 'quick_entry' | 'manual' | 'import'
export type BetSource = 'manual' | 'scanner' | 'import' | 'quick_entry' | 'ai_analyst'
export type AgentType = 'analyst' | 'scout' | 'scanner' | 'risk_manager' | 'coach' | 'portfolio'
export type TxnType = 'deposit' | 'withdrawal' | 'stake' | 'payout' | 'adjustment' | 'bonus'

// ─── CORE ENTITIES ──────────────────────────────────────────
export interface Profile {
  id: string
  email?: string
  display_name?: string
  currency: string
  default_stake: number
  kelly_fraction: number
  web_search_enabled: boolean
  timezone: string
  created_at: string
  updated_at: string
}

export interface Bankroll {
  id: string
  user_id: string
  name: string
  currency: string
  balance: number
  is_default: boolean
  created_at: string
  updated_at: string
}

export interface Decision {
  id: string
  user_id: string
  sport?: string
  league?: string
  event_name: string
  market_type?: string
  selection?: string
  line?: number
  offered_odds?: number
  bookmaker?: string
  model_probability?: number
  implied_probability?: number
  edge_percent?: number
  confidence_score?: number
  risk_level?: RiskLevel
  recommendation?: Recommendation
  final_action: FinalAction
  source: DecisionSource
  reasoning?: string
  factors?: AnalysisFactor[]
  metadata?: Record<string, unknown>
  // Sprint 2: multilingual + raw text
  input_language?: string
  output_language?: string
  raw_event_text?: string
  raw_market_text?: string
  participants?: Record<string, unknown>
  created_at: string
  updated_at: string
}

// Sprint 2: Analyst API types
export interface AnalystRequest {
  sport: string
  event_name: string
  market_type: string
  selection?: string
  line?: number
  offered_odds: number
  bookmaker?: string
  notes?: string
  output_language?: string
}

export interface AnalystResponse {
  model_probability:   number
  implied_probability: number
  edge_percent:        number
  confidence_score:    number
  risk_level:          RiskLevel
  recommendation:      Recommendation
  reasoning:           string
  factors:             AnalysisFactor[]
  disclaimer?:         string
}

export interface AnalysisFactor {
  name: string
  score: number   // -3 to +3
  detail: string
}

export interface AIAnalysisRun {
  id: string
  user_id: string
  decision_id?: string
  agent_type: AgentType
  model_name?: string
  input_snapshot?: Record<string, unknown>
  output_summary?: string
  output_json?: Record<string, unknown>
  confidence_score?: number
  web_search_used: boolean
  created_at: string
}

export interface Bet {
  id: string
  user_id: string
  bankroll_id?: string
  bet_type: BetType
  stake: number
  total_odds?: number
  potential_payout?: number
  status: BetStatus
  pnl?: number | null
  placed_at: string
  settled_at?: string
  settlement_outcome?: 'won' | 'lost' | 'void'
  bookmaker?: string
  source: BetSource
  notes?: string
  created_at: string
  updated_at: string
  // joined
  legs?: BetLeg[]
}

export interface BetLeg {
  id: string
  bet_id: string
  decision_id?: string
  sport?: string
  event_name: string
  market_type?: string
  selection?: string
  line?: number
  odds: number
  leg_status: LegStatus
  result_notes?: string
  created_at: string
  updated_at: string
}

export interface BankrollTransaction {
  id: string
  user_id: string
  bankroll_id?: string
  bet_id?: string
  type: TxnType
  amount: number
  balance_after: number
  metadata?: Record<string, unknown>
  created_at: string
}

// ─── SCOUT ──────────────────────────────────────────────────
export type OpportunityStatus =
  'discovered' | 'research_needed' | 'watchlisted' |
  'converted_to_decision' | 'dismissed' | 'expired'

export type OpportunityType = 'value' | 'contrarian' | 'pattern' | 'general'

export interface MarketOpportunity {
  id: string
  user_id: string
  sport_code: string
  event_name: string
  market_type: string
  selection?: string
  line?: number
  offered_odds?: number
  bookmaker?: string
  opportunity_type: OpportunityType
  scout_score?: number
  model_probability?: number
  implied_probability?: number
  edge_percent?: number
  confidence_score?: number
  data_quality_score?: number
  risk_level?: 'low' | 'medium' | 'high'
  status: OpportunityStatus
  reasoning: string
  required_checks?: string[]
  linked_decision_id?: string
  web_search_used: boolean
  scout_run_input?: Record<string, unknown>
  created_at: string
  updated_at: string
}

// ─── UI HELPERS ─────────────────────────────────────────────
export interface Stats {
  total_decisions: number
  total_bets: number
  won: number
  lost: number
  pending: number
  total_staked: number
  total_profit: number
  roi: number
  yield: number
  win_rate: number
  avg_odds: number
}
