export const SUPPORTED_UI_LOCALES = ['en', 'uk', 'ru'] as const

export type UiLocale = (typeof SUPPORTED_UI_LOCALES)[number]

export const DEFAULT_UI_LOCALE: UiLocale = 'en'

export const LEGACY_UI_LOCALES = ['auto', 'es', 'fr', 'de', 'ar'] as const

export type LegacyUiLocale = (typeof LEGACY_UI_LOCALES)[number]

export const UI_LOCALE_OPTIONS = [
  { value: 'en', label: 'English' },
  { value: 'uk', label: 'Українська' },
  { value: 'ru', label: 'Русский' },
] as const satisfies readonly { value: UiLocale; label: string }[]

export const UI_LOCALE_PROMPT_NAMES: Readonly<Record<UiLocale, string>> = {
  en: 'English',
  uk: 'Ukrainian',
  ru: 'Russian',
}

const SUPPORTED_UI_LOCALE_SET = new Set<string>(SUPPORTED_UI_LOCALES)
const LEGACY_UI_LOCALE_SET = new Set<string>(LEGACY_UI_LOCALES)

export function isUiLocale(value: unknown): value is UiLocale {
  return typeof value === 'string' && SUPPORTED_UI_LOCALE_SET.has(value)
}

export function isLegacyUiLocale(value: unknown): value is LegacyUiLocale {
  return typeof value === 'string' && LEGACY_UI_LOCALE_SET.has(value)
}

/**
 * Read-path compatibility for historical decisions created before R18.
 * Legacy, missing, and unknown values are quarantined to English presentation;
 * write boundaries must reject them instead of calling this helper.
 */
export function resolveStoredUiLocale(value: unknown): UiLocale {
  return isUiLocale(value) ? value : DEFAULT_UI_LOCALE
}
