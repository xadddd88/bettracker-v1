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

  // Bet settlement
  BET_SETTLE_CLICKED: 'bet_settle_clicked',
  BET_SETTLE_WON:     'bet_settle_won',
  BET_SETTLE_LOST:    'bet_settle_lost',
  BET_SETTLE_VOID:    'bet_settle_void',
  BET_SETTLE_FAILED:  'bet_settle_failed',

  // Scanner
  SCANNER_STARTED:          'scanner_started',
  SCANNER_COMPLETED:        'scanner_completed',
  SCANNER_FAILED:           'scanner_failed',
  SCANNER_EXPRESS_DETECTED: 'scanner_express_detected',

  // Page views
  DASHBOARD_VIEWED:  'dashboard_viewed',
  AI_PAGE_VIEWED:    'ai_page_viewed',
  BET_DETAIL_VIEWED: 'bet_detail_viewed',
  BETS_LIST_VIEWED:  'bets_list_viewed',
} as const

export type EventName = (typeof EVENTS)[keyof typeof EVENTS]
