// R18 PR3C Package A — pure, versioned market-access presentation contract.
//
// This module translates an already-issued status/reason pair into localized copy.
// It does not evaluate evidence, grant access, read environment state, call a route,
// or persist anything. Unknown input fails closed to policy_state_unavailable.

import {
  DEFAULT_UI_LOCALE,
  isUiLocale,
  type UiLocale,
} from '../i18n/ui-locale'
import type {
  MarketEligibilityReason,
  MarketEligibilityStatus,
} from './contract'

export const MARKET_ELIGIBILITY_PRESENTATION_VERSION = 'R18_PR3C_PACKAGE_A_V1' as const

export const MARKET_ELIGIBILITY_PRESENTATION_COPY_KEYS = Object.freeze([
  'market_access.v1.eligible.eligible',
  'market_access.v1.blocked.market_not_enabled',
  'market_access.v1.blocked.policy_blocked',
  'market_access.v1.blocked.policy_state_unavailable',
  'market_access.v1.unsupported.unknown_market_profile',
  'market_access.v1.unsupported.northern_ireland_not_in_profile',
  'market_access.v1.unsupported.unsupported_residence',
  'market_access.v1.verification_required.residence_verification_required',
  'market_access.v1.verification_required.market_signals_unresolved',
  'market_access.v1.verification_required.current_location_required',
  'market_access.v1.verification_required.legal_terms_status_required',
  'market_access.v1.verification_required.verification_required',
  'market_access.v1.verification_pending.verification_pending',
  'market_access.v1.travel_limited.travel_outside_profile',
  'market_access.v1.signal_conflict.market_signal_conflict',
  'market_access.v1.legal_terms_update_required.legal_terms_update_required',
] as const)

export type MarketEligibilityPresentationCopyKey =
  (typeof MARKET_ELIGIBILITY_PRESENTATION_COPY_KEYS)[number]

export const MARKET_ELIGIBILITY_PRIMARY_ACTION_KEYS = Object.freeze([
  'continue_home',
  'view_current_status',
  'contact_support',
  'retry_status_check',
  'view_supported_areas',
  'review_recorded_information',
  'start_verification',
  'continue_verification',
  'provide_current_territory',
  'review_current_documents',
  'view_review_status',
  'review_information',
] as const)

export type MarketEligibilityPrimaryActionKey =
  (typeof MARKET_ELIGIBILITY_PRIMARY_ACTION_KEYS)[number]

export const MARKET_ELIGIBILITY_SAFE_DESTINATION_KEYS = Object.freeze([
  'market_access_details',
  'settings',
  'privacy',
  'privacy_notice',
  'help',
  'history',
  'review',
  'export_delete',
  'billing',
  'support',
  'save_progress',
] as const)

export type MarketEligibilitySafeDestinationKey =
  (typeof MARKET_ELIGIBILITY_SAFE_DESTINATION_KEYS)[number]

export type MarketEligibilityPresentationTone =
  | 'success'
  | 'review'
  | 'negative'
  | 'neutral'

export interface MarketEligibilityPresentationDefinition {
  readonly status: MarketEligibilityStatus
  readonly reason: MarketEligibilityReason
  readonly copyKey: MarketEligibilityPresentationCopyKey
  readonly tone: MarketEligibilityPresentationTone
  readonly primaryActionKey: MarketEligibilityPrimaryActionKey
  readonly safeDestinationKeys: readonly MarketEligibilitySafeDestinationKey[]
}

const safeDestinations = <T extends readonly MarketEligibilitySafeDestinationKey[]>(...keys: T) =>
  Object.freeze(keys)

const PRESENTATION_DEFINITIONS = [
  {
    status: 'eligible',
    reason: 'eligible',
    copyKey: 'market_access.v1.eligible.eligible',
    tone: 'success',
    primaryActionKey: 'continue_home',
    safeDestinationKeys: safeDestinations('market_access_details'),
  },
  {
    status: 'blocked',
    reason: 'market_not_enabled',
    copyKey: 'market_access.v1.blocked.market_not_enabled',
    tone: 'negative',
    primaryActionKey: 'view_current_status',
    safeDestinationKeys: safeDestinations('settings', 'privacy', 'help', 'history'),
  },
  {
    status: 'blocked',
    reason: 'policy_blocked',
    copyKey: 'market_access.v1.blocked.policy_blocked',
    tone: 'negative',
    primaryActionKey: 'contact_support',
    safeDestinationKeys: safeDestinations('privacy', 'export_delete', 'history'),
  },
  {
    status: 'blocked',
    reason: 'policy_state_unavailable',
    copyKey: 'market_access.v1.blocked.policy_state_unavailable',
    tone: 'negative',
    primaryActionKey: 'retry_status_check',
    safeDestinationKeys: safeDestinations('privacy', 'help', 'history'),
  },
  {
    status: 'unsupported',
    reason: 'unknown_market_profile',
    copyKey: 'market_access.v1.unsupported.unknown_market_profile',
    tone: 'negative',
    primaryActionKey: 'view_supported_areas',
    safeDestinationKeys: safeDestinations('privacy', 'export_delete', 'help', 'history'),
  },
  {
    status: 'unsupported',
    reason: 'northern_ireland_not_in_profile',
    copyKey: 'market_access.v1.unsupported.northern_ireland_not_in_profile',
    tone: 'negative',
    primaryActionKey: 'view_supported_areas',
    safeDestinationKeys: safeDestinations('privacy', 'export_delete', 'help', 'history'),
  },
  {
    status: 'unsupported',
    reason: 'unsupported_residence',
    copyKey: 'market_access.v1.unsupported.unsupported_residence',
    tone: 'negative',
    primaryActionKey: 'review_recorded_information',
    safeDestinationKeys: safeDestinations('privacy', 'export_delete', 'help', 'history'),
  },
  {
    status: 'verification_required',
    reason: 'residence_verification_required',
    copyKey: 'market_access.v1.verification_required.residence_verification_required',
    tone: 'review',
    primaryActionKey: 'start_verification',
    safeDestinationKeys: safeDestinations('save_progress', 'privacy', 'help'),
  },
  {
    status: 'verification_required',
    reason: 'market_signals_unresolved',
    copyKey: 'market_access.v1.verification_required.market_signals_unresolved',
    tone: 'review',
    primaryActionKey: 'continue_verification',
    safeDestinationKeys: safeDestinations('save_progress', 'privacy', 'help'),
  },
  {
    status: 'verification_required',
    reason: 'current_location_required',
    copyKey: 'market_access.v1.verification_required.current_location_required',
    tone: 'review',
    primaryActionKey: 'provide_current_territory',
    safeDestinationKeys: safeDestinations('save_progress', 'privacy', 'help'),
  },
  {
    status: 'verification_required',
    reason: 'legal_terms_status_required',
    copyKey: 'market_access.v1.verification_required.legal_terms_status_required',
    tone: 'review',
    primaryActionKey: 'review_current_documents',
    safeDestinationKeys: safeDestinations('privacy_notice', 'help'),
  },
  {
    status: 'verification_required',
    reason: 'verification_required',
    copyKey: 'market_access.v1.verification_required.verification_required',
    tone: 'review',
    primaryActionKey: 'continue_verification',
    safeDestinationKeys: safeDestinations('save_progress', 'privacy', 'help'),
  },
  {
    status: 'verification_pending',
    reason: 'verification_pending',
    copyKey: 'market_access.v1.verification_pending.verification_pending',
    tone: 'review',
    primaryActionKey: 'view_review_status',
    safeDestinationKeys: safeDestinations('privacy', 'help', 'history'),
  },
  {
    status: 'travel_limited',
    reason: 'travel_outside_profile',
    copyKey: 'market_access.v1.travel_limited.travel_outside_profile',
    tone: 'review',
    primaryActionKey: 'view_current_status',
    safeDestinationKeys: safeDestinations(
      'history',
      'review',
      'export_delete',
      'billing',
      'privacy',
      'support',
    ),
  },
  {
    status: 'signal_conflict',
    reason: 'market_signal_conflict',
    copyKey: 'market_access.v1.signal_conflict.market_signal_conflict',
    tone: 'negative',
    primaryActionKey: 'review_information',
    safeDestinationKeys: safeDestinations('save_progress', 'privacy', 'help'),
  },
  {
    status: 'legal_terms_update_required',
    reason: 'legal_terms_update_required',
    copyKey: 'market_access.v1.legal_terms_update_required.legal_terms_update_required',
    tone: 'review',
    primaryActionKey: 'review_current_documents',
    safeDestinationKeys: safeDestinations('privacy_notice', 'history', 'help'),
  },
] as const satisfies readonly MarketEligibilityPresentationDefinition[]

export const MARKET_ELIGIBILITY_PRESENTATION_DEFINITIONS = Object.freeze(
  PRESENTATION_DEFINITIONS.map(definition => Object.freeze(definition)),
)

interface MarketEligibilityCopy {
  readonly heading: string
  readonly description: string
}

const MARKET_ELIGIBILITY_COPY = Object.freeze({
  en: Object.freeze({
    'market_access.v1.eligible.eligible': {
      heading: 'Market access confirmed',
      description: 'Your server-issued market access decision is current. Membership and feature-specific checks still apply.',
    },
    'market_access.v1.blocked.market_not_enabled': {
      heading: 'This market is not available yet',
      description: 'This market profile is configured but has not been enabled. Changing language or display settings cannot unlock it.',
    },
    'market_access.v1.blocked.policy_blocked': {
      heading: 'Access is currently unavailable',
      description: 'Market-restricted features are unavailable under the current policy decision. Existing records and privacy controls remain available.',
    },
    'market_access.v1.blocked.policy_state_unavailable': {
      heading: 'Access check is temporarily unavailable',
      description: 'We could not confirm the current market policy state. Access stays blocked until a successful server check.',
    },
    'market_access.v1.unsupported.unknown_market_profile': {
      heading: 'This market profile is not supported',
      description: 'The recorded market profile is not supported. Language, currency, and display settings do not change eligibility.',
    },
    'market_access.v1.unsupported.northern_ireland_not_in_profile': {
      heading: 'Northern Ireland is not included in this profile',
      description: 'This profile covers England, Wales, and Scotland. Northern Ireland requires a separately approved profile.',
    },
    'market_access.v1.unsupported.unsupported_residence': {
      heading: 'Service is unavailable for the recorded residence',
      description: 'The recorded residence is outside this supported market profile. Existing account records remain available.',
    },
    'market_access.v1.verification_required.residence_verification_required': {
      heading: 'Residence information is required',
      description: 'Approved residence information is needed before market access can be reviewed.',
    },
    'market_access.v1.verification_required.market_signals_unresolved': {
      heading: 'More information is required',
      description: 'The available signals are not enough to complete the review. Provide only the approved verification information.',
    },
    'market_access.v1.verification_required.current_location_required': {
      heading: 'Current territory is required',
      description: 'Approved coarse current-territory information is needed. This contract does not request precise or continuous location.',
    },
    'market_access.v1.verification_required.legal_terms_status_required': {
      heading: 'Current terms status is required',
      description: 'The current terms status could not be confirmed. Review the current documents before access can be reconsidered.',
    },
    'market_access.v1.verification_required.verification_required': {
      heading: 'Verification is required',
      description: 'Verification is required before market-restricted features can be used.',
    },
    'market_access.v1.verification_pending.verification_pending': {
      heading: 'Verification is under review',
      description: 'Your verification is pending. The current access decision stays in place until the server review finishes.',
    },
    'market_access.v1.travel_limited.travel_outside_profile': {
      heading: 'Market features are limited while travelling',
      description: 'Market-restricted features are limited while the recorded current territory is outside the supported profile. Existing records remain available.',
    },
    'market_access.v1.signal_conflict.market_signal_conflict': {
      heading: 'Provided signals do not agree',
      description: 'Review the recorded information or contact support. Internal risk and anti-abuse logic is not shown.',
    },
    'market_access.v1.legal_terms_update_required.legal_terms_update_required': {
      heading: 'Updated terms require review',
      description: 'A newer terms version requires review before market-restricted access can continue.',
    },
  }),
  uk: Object.freeze({
    'market_access.v1.eligible.eligible': {
      heading: 'Доступ до ринку підтверджено',
      description: 'Серверне рішення щодо доступу чинне. Вимоги активного членства та окремих функцій продовжують діяти.',
    },
    'market_access.v1.blocked.market_not_enabled': {
      heading: 'Цей ринок поки недоступний',
      description: 'Профіль ринку налаштовано, але ще не ввімкнено. Зміна мови чи параметрів відображення не відкриє доступ.',
    },
    'market_access.v1.blocked.policy_blocked': {
      heading: 'Доступ наразі недоступний',
      description: 'Функції з ринковими обмеженнями недоступні за поточним рішенням політики. Історія та налаштування приватності залишаються доступними.',
    },
    'market_access.v1.blocked.policy_state_unavailable': {
      heading: 'Перевірка доступу тимчасово недоступна',
      description: 'Не вдалося підтвердити поточний стан ринкової політики. Доступ залишається закритим до успішної серверної перевірки.',
    },
    'market_access.v1.unsupported.unknown_market_profile': {
      heading: 'Цей профіль ринку не підтримується',
      description: 'Записаний профіль ринку не підтримується. Мова, валюта й параметри відображення не змінюють право доступу.',
    },
    'market_access.v1.unsupported.northern_ireland_not_in_profile': {
      heading: 'Північна Ірландія не входить до цього профілю',
      description: 'Цей профіль охоплює Англію, Уельс і Шотландію. Для Північної Ірландії потрібен окремо затверджений профіль.',
    },
    'market_access.v1.unsupported.unsupported_residence': {
      heading: 'Сервіс недоступний для вказаного місця проживання',
      description: 'Вказане місце проживання не входить до цього підтримуваного профілю. Наявна історія облікового запису залишається доступною.',
    },
    'market_access.v1.verification_required.residence_verification_required': {
      heading: 'Потрібні дані про місце проживання',
      description: 'Для перевірки доступу потрібні затверджені дані про місце проживання.',
    },
    'market_access.v1.verification_required.market_signals_unresolved': {
      heading: 'Потрібна додаткова інформація',
      description: 'Наявних сигналів недостатньо для завершення перевірки. Надайте лише затверджену інформацію для верифікації.',
    },
    'market_access.v1.verification_required.current_location_required': {
      heading: 'Потрібна поточна територія',
      description: 'Потрібні затверджені узагальнені дані про поточну територію. Цей контракт не запитує точну чи постійну геолокацію.',
    },
    'market_access.v1.verification_required.legal_terms_status_required': {
      heading: 'Потрібен статус чинних умов',
      description: 'Не вдалося підтвердити статус чинних умов. Перегляньте актуальні документи перед повторним розглядом доступу.',
    },
    'market_access.v1.verification_required.verification_required': {
      heading: 'Потрібна верифікація',
      description: 'Верифікація потрібна до використання функцій із ринковими обмеженнями.',
    },
    'market_access.v1.verification_pending.verification_pending': {
      heading: 'Верифікація на розгляді',
      description: 'Верифікація очікує розгляду. Поточне рішення щодо доступу діє до завершення серверної перевірки.',
    },
    'market_access.v1.travel_limited.travel_outside_profile': {
      heading: 'Функції ринку обмежені під час подорожі',
      description: 'Функції з ринковими обмеженнями недоступні, поки записана поточна територія перебуває поза підтримуваним профілем. Наявна історія залишається доступною.',
    },
    'market_access.v1.signal_conflict.market_signal_conflict': {
      heading: 'Надані сигнали не узгоджуються',
      description: 'Перевірте записану інформацію або зверніться до підтримки. Внутрішня логіка ризику та протидії зловживанням не відображається.',
    },
    'market_access.v1.legal_terms_update_required.legal_terms_update_required': {
      heading: 'Потрібно переглянути оновлені умови',
      description: 'Новішу версію умов потрібно переглянути до продовження доступу до функцій із ринковими обмеженнями.',
    },
  }),
  ru: Object.freeze({
    'market_access.v1.eligible.eligible': {
      heading: 'Доступ к рынку подтверждён',
      description: 'Серверное решение о доступе актуально. Требования активного членства и отдельных функций продолжают действовать.',
    },
    'market_access.v1.blocked.market_not_enabled': {
      heading: 'Этот рынок пока недоступен',
      description: 'Профиль рынка настроен, но ещё не включён. Смена языка или параметров отображения не откроет доступ.',
    },
    'market_access.v1.blocked.policy_blocked': {
      heading: 'Доступ сейчас недоступен',
      description: 'Функции с рыночными ограничениями недоступны по текущему решению политики. История и настройки приватности остаются доступными.',
    },
    'market_access.v1.blocked.policy_state_unavailable': {
      heading: 'Проверка доступа временно недоступна',
      description: 'Не удалось подтвердить текущее состояние рыночной политики. Доступ остаётся закрытым до успешной серверной проверки.',
    },
    'market_access.v1.unsupported.unknown_market_profile': {
      heading: 'Этот профиль рынка не поддерживается',
      description: 'Записанный профиль рынка не поддерживается. Язык, валюта и параметры отображения не меняют право доступа.',
    },
    'market_access.v1.unsupported.northern_ireland_not_in_profile': {
      heading: 'Северная Ирландия не входит в этот профиль',
      description: 'Этот профиль охватывает Англию, Уэльс и Шотландию. Для Северной Ирландии нужен отдельно утверждённый профиль.',
    },
    'market_access.v1.unsupported.unsupported_residence': {
      heading: 'Сервис недоступен для указанного места проживания',
      description: 'Указанное место проживания не входит в поддерживаемый профиль. Существующая история аккаунта остаётся доступной.',
    },
    'market_access.v1.verification_required.residence_verification_required': {
      heading: 'Нужны данные о месте проживания',
      description: 'Для проверки доступа нужны утверждённые данные о месте проживания.',
    },
    'market_access.v1.verification_required.market_signals_unresolved': {
      heading: 'Нужна дополнительная информация',
      description: 'Доступных сигналов недостаточно для завершения проверки. Предоставьте только утверждённую информацию для верификации.',
    },
    'market_access.v1.verification_required.current_location_required': {
      heading: 'Нужна текущая территория',
      description: 'Нужны утверждённые обобщённые данные о текущей территории. Этот контракт не запрашивает точную или постоянную геолокацию.',
    },
    'market_access.v1.verification_required.legal_terms_status_required': {
      heading: 'Нужен статус действующих условий',
      description: 'Не удалось подтвердить статус действующих условий. Просмотрите актуальные документы до повторного рассмотрения доступа.',
    },
    'market_access.v1.verification_required.verification_required': {
      heading: 'Нужна верификация',
      description: 'Верификация нужна до использования функций с рыночными ограничениями.',
    },
    'market_access.v1.verification_pending.verification_pending': {
      heading: 'Верификация на рассмотрении',
      description: 'Верификация ожидает рассмотрения. Текущее решение о доступе действует до завершения серверной проверки.',
    },
    'market_access.v1.travel_limited.travel_outside_profile': {
      heading: 'Функции рынка ограничены во время поездки',
      description: 'Функции с рыночными ограничениями недоступны, пока записанная текущая территория находится вне поддерживаемого профиля. Существующая история остаётся доступной.',
    },
    'market_access.v1.signal_conflict.market_signal_conflict': {
      heading: 'Предоставленные сигналы не согласуются',
      description: 'Проверьте записанную информацию или обратитесь в поддержку. Внутренняя логика риска и противодействия злоупотреблениям не показывается.',
    },
    'market_access.v1.legal_terms_update_required.legal_terms_update_required': {
      heading: 'Нужно просмотреть обновлённые условия',
      description: 'Новую версию условий нужно просмотреть до продолжения доступа к функциям с рыночными ограничениями.',
    },
  }),
} as const satisfies Readonly<
  Record<UiLocale, Readonly<Record<MarketEligibilityPresentationCopyKey, MarketEligibilityCopy>>>
>)

const PRIMARY_ACTION_LABELS = Object.freeze({
  en: Object.freeze({
    continue_home: 'Continue to Home',
    view_current_status: 'View current status',
    contact_support: 'Contact support',
    retry_status_check: 'Retry status check',
    view_supported_areas: 'View supported areas',
    review_recorded_information: 'Review recorded information',
    start_verification: 'Start verification',
    continue_verification: 'Continue verification',
    provide_current_territory: 'Provide current territory',
    review_current_documents: 'Review current documents',
    view_review_status: 'View review status',
    review_information: 'Review information',
  }),
  uk: Object.freeze({
    continue_home: 'Перейти на Головну',
    view_current_status: 'Переглянути поточний статус',
    contact_support: 'Звернутися до підтримки',
    retry_status_check: 'Повторити перевірку статусу',
    view_supported_areas: 'Переглянути підтримувані території',
    review_recorded_information: 'Переглянути вказану інформацію',
    start_verification: 'Почати верифікацію',
    continue_verification: 'Продовжити верифікацію',
    provide_current_territory: 'Вказати поточну територію',
    review_current_documents: 'Переглянути актуальні документи',
    view_review_status: 'Переглянути статус перевірки',
    review_information: 'Переглянути інформацію',
  }),
  ru: Object.freeze({
    continue_home: 'Перейти на главную',
    view_current_status: 'Посмотреть текущий статус',
    contact_support: 'Обратиться в поддержку',
    retry_status_check: 'Повторить проверку статуса',
    view_supported_areas: 'Посмотреть поддерживаемые территории',
    review_recorded_information: 'Проверить указанные данные',
    start_verification: 'Начать верификацию',
    continue_verification: 'Продолжить верификацию',
    provide_current_territory: 'Указать текущую территорию',
    review_current_documents: 'Просмотреть актуальные документы',
    view_review_status: 'Посмотреть статус проверки',
    review_information: 'Проверить информацию',
  }),
} as const satisfies Readonly<
  Record<UiLocale, Readonly<Record<MarketEligibilityPrimaryActionKey, string>>>
>)

const SAFE_DESTINATION_LABELS = Object.freeze({
  en: Object.freeze({
    market_access_details: 'Market access details',
    settings: 'Settings',
    privacy: 'Privacy controls',
    privacy_notice: 'Privacy notice',
    help: 'Help',
    history: 'History',
    review: 'Review',
    export_delete: 'Export and delete',
    billing: 'Billing',
    support: 'Support',
    save_progress: 'Save progress',
  }),
  uk: Object.freeze({
    market_access_details: 'Деталі доступу до ринку',
    settings: 'Налаштування',
    privacy: 'Налаштування приватності',
    privacy_notice: 'Повідомлення про конфіденційність',
    help: 'Допомога',
    history: 'Історія',
    review: 'Огляд',
    export_delete: 'Експорт і видалення',
    billing: 'Оплата',
    support: 'Підтримка',
    save_progress: 'Зберегти прогрес',
  }),
  ru: Object.freeze({
    market_access_details: 'Детали доступа к рынку',
    settings: 'Настройки',
    privacy: 'Настройки приватности',
    privacy_notice: 'Уведомление о конфиденциальности',
    help: 'Помощь',
    history: 'История',
    review: 'Обзор',
    export_delete: 'Экспорт и удаление',
    billing: 'Оплата',
    support: 'Поддержка',
    save_progress: 'Сохранить прогресс',
  }),
} as const satisfies Readonly<
  Record<UiLocale, Readonly<Record<MarketEligibilitySafeDestinationKey, string>>>
>)

export interface MarketEligibilityPresentationAction {
  readonly key: MarketEligibilityPrimaryActionKey
  readonly label: string
}

export interface MarketEligibilityPresentationDestination {
  readonly key: MarketEligibilitySafeDestinationKey
  readonly label: string
}

export interface MarketEligibilityPresentationModel {
  readonly contractVersion: typeof MARKET_ELIGIBILITY_PRESENTATION_VERSION
  readonly copyKey: MarketEligibilityPresentationCopyKey
  readonly locale: UiLocale
  readonly status: MarketEligibilityStatus
  readonly reason: MarketEligibilityReason
  readonly tone: MarketEligibilityPresentationTone
  readonly heading: string
  readonly description: string
  readonly primaryAction: MarketEligibilityPresentationAction
  readonly safeDestinations: readonly MarketEligibilityPresentationDestination[]
}

export interface MarketEligibilityPresentationInput {
  readonly locale: unknown
  readonly status: unknown
  readonly reason: unknown
}

const decisionKey = (status: unknown, reason: unknown) => `${String(status)}/${String(reason)}`

const DEFINITION_BY_DECISION = new Map<string, MarketEligibilityPresentationDefinition>(
  MARKET_ELIGIBILITY_PRESENTATION_DEFINITIONS.map(definition => [
    decisionKey(definition.status, definition.reason),
    definition,
  ]),
)

const FALLBACK_DEFINITION = MARKET_ELIGIBILITY_PRESENTATION_DEFINITIONS.find(
  definition => definition.status === 'blocked' && definition.reason === 'policy_state_unavailable',
)!

/**
 * Build copy for an already-issued server decision. This is presentation only: callers
 * must never use the returned tone, action, or text as authorization evidence.
 */
export function resolveMarketEligibilityPresentation(
  input: MarketEligibilityPresentationInput,
): MarketEligibilityPresentationModel {
  const locale = isUiLocale(input.locale) ? input.locale : DEFAULT_UI_LOCALE
  const definition = DEFINITION_BY_DECISION.get(decisionKey(input.status, input.reason))
    ?? FALLBACK_DEFINITION
  const copy = MARKET_ELIGIBILITY_COPY[locale][definition.copyKey]
  const primaryAction = Object.freeze({
    key: definition.primaryActionKey,
    label: PRIMARY_ACTION_LABELS[locale][definition.primaryActionKey],
  })
  const safeDestinations = Object.freeze(definition.safeDestinationKeys.map(key => Object.freeze({
    key,
    label: SAFE_DESTINATION_LABELS[locale][key],
  })))

  return Object.freeze({
    contractVersion: MARKET_ELIGIBILITY_PRESENTATION_VERSION,
    copyKey: definition.copyKey,
    locale,
    status: definition.status,
    reason: definition.reason,
    tone: definition.tone,
    heading: copy.heading,
    description: copy.description,
    primaryAction,
    safeDestinations,
  })
}
