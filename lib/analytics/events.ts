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

  // Scanner
  SCANNER_STARTED:          'scanner_started',
  SCANNER_COMPLETED:        'scanner_completed',
  SCANNER_FAILED:           'scanner_failed',
  SCANNER_EXPRESS_DETECTED: 'scanner_express_detected',

  // Page views
  DASHBOARD_VIEWED:       'dashboard_viewed',
  AI_PAGE_VIEWED:         'ai_page_viewed',
  BET_DETAIL_VIEWED:      'bet_detail_viewed',
  BETS_LIST_VIEWED:       'bets_list_viewed',
  DECISION_DETAIL_VIEWED: 'decision_detail_viewed',
  ANALYTICS_VIEWED:       'analytics_viewed',
} as const

export type EventName = (typeof EVENTS)[keyof typeof EVENTS]
