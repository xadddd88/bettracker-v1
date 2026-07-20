export const EVENTS = {
  // AI Analyst
  AI_ANALYSIS_STARTED:   'ai_analysis_started',
  AI_ANALYSIS_COMPLETED: 'ai_analysis_completed',
  AI_ANALYSIS_FAILED:    'ai_analysis_failed',
  DECISION_CREATED:      'decision_created',

  // Decision actions
  DECISION_ACTION_WATCH:         'decision_action_watch',
  DECISION_ACTION_SKIP:          'decision_action_skip',
  DECISION_ACTION_PLACE_CLICKED: 'decision_action_place_clicked',
  DECISION_ACTION_PLACED:        'decision_action_placed',
  DECISION_ACTION_FAILED:        'decision_action_failed',

  // Bet placement
  BET_PLACE_CLICKED:         'bet_place_clicked',
  BET_PLACE_SUCCEEDED:       'bet_place_succeeded',
  BET_PLACE_FAILED:          'bet_place_failed',
  BET_DUPLICATE_REJECTED:    'bet_duplicate_rejected',

  // Bet settlement
  BET_SETTLE_CLICKED:            'bet_settle_clicked',
  BET_SETTLE_WON:                'bet_settle_won',
  BET_SETTLE_LOST:               'bet_settle_lost',
  BET_SETTLE_VOID:               'bet_settle_void',
  BET_SETTLE_FAILED:             'bet_settle_failed',
  BET_SETTLE_DUPLICATE_REJECTED: 'bet_settle_duplicate_rejected',

  // Pending bet cancellation (soft delete + atomic stake refund)
  BET_CANCEL_CLICKED:   'bet_cancel_clicked',
  BET_CANCEL_SUCCEEDED: 'bet_cancel_succeeded',
  BET_CANCEL_FAILED:    'bet_cancel_failed',

  // Scanner
  SCANNER_STARTED:          'scanner_started',
  SCANNER_COMPLETED:        'scanner_completed',
  SCANNER_FAILED:           'scanner_failed',
  SCANNER_EXPRESS_DETECTED: 'scanner_express_detected',

  // Scout
  SCOUT_STARTED:             'scout_started',
  SCOUT_COMPLETED:           'scout_completed',
  SCOUT_FAILED:              'scout_failed',
  SCOUT_PAGE_VIEWED:         'scout_page_viewed',
  SCOUT_WEB_SEARCH_FALLBACK: 'scout_web_search_fallback',
  SCOUT_RATE_LIMITED:        'scout_rate_limited',
  OPPORTUNITY_ANALYSED:      'opportunity_analysed',
  OPPORTUNITY_WATCHLISTED:   'opportunity_watchlisted',
  OPPORTUNITY_DISMISSED:     'opportunity_dismissed',

  // Beta signup
  BETA_SIGNUP_ATTEMPTED: 'beta_signup_attempted',
  BETA_SIGNUP_ALLOWED:   'beta_signup_allowed',
  BETA_SIGNUP_BLOCKED:   'beta_signup_blocked',
  BETA_SIGNUP_COMPLETED: 'beta_signup_completed',

  // Coach
  COACH_STARTED:     'coach_started',
  COACH_COMPLETED:   'coach_completed',
  COACH_FAILED:      'coach_failed',
  COACH_PAGE_VIEWED: 'coach_page_viewed',

  // Bankroll
  BANKROLL_PAGE_VIEWED: 'bankroll_page_viewed',
  DEPOSIT_RECORDED:     'deposit_recorded',
  WITHDRAWAL_RECORDED:  'withdrawal_recorded',

  // Risk Manager
  RISK_EVALUATION_REQUESTED: 'risk_evaluation_requested',
  RISK_EVALUATION_COMPLETED: 'risk_evaluation_completed',
  RISK_WARNING_SHOWN:        'risk_warning_shown',
  RISK_PLACE_ANYWAY_CLICKED: 'risk_place_anyway_clicked',
  RISK_STAKE_ADJUSTED:       'risk_stake_adjusted',

  // Onboarding
  ONBOARDING_VIEWED:    'onboarding_viewed',
  ONBOARDING_COMPLETED: 'onboarding_completed',

  // Dashboard next action
  NEXT_ACTION_CLICKED:  'next_action_clicked',

  // Beta feedback
  BETA_FEEDBACK_OPENED:    'beta_feedback_opened',
  BETA_FEEDBACK_SUBMITTED: 'beta_feedback_submitted',

  // Settings
  SETTINGS_PAGE_VIEWED: 'settings_page_viewed',
  SETTINGS_SAVED:       'settings_saved',

  // Page views
  DASHBOARD_VIEWED:        'dashboard_viewed',
  AI_PAGE_VIEWED:          'ai_page_viewed',
  BET_DETAIL_VIEWED:       'bet_detail_viewed',
  BETS_LIST_VIEWED:        'bets_list_viewed',
  DECISIONS_LIST_VIEWED:   'decisions_list_viewed',
  DECISION_DETAIL_VIEWED:  'decision_detail_viewed',
  ANALYTICS_VIEWED:        'analytics_viewed',
} as const

export type EventName = (typeof EVENTS)[keyof typeof EVENTS]
