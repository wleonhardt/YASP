import { safeGetStoredValue, safeSetStoredValue } from "../lib/storage";

export const SUPPORTED_LOCALES = ["en", "es", "fr", "de", "pt", "ja", "ko", "zh-Hans", "zh-Hant"] as const;
export type AppLocale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: AppLocale = "en";
const LOCALE_STORAGE_KEY = "yasp.locale";
const CHINESE_SIMPLIFIED_REGIONS = new Set(["cn", "sg"]);
const CHINESE_TRADITIONAL_REGIONS = new Set(["tw", "hk", "mo"]);

type LanguageSource = {
  language?: string;
  languages?: readonly string[];
};

export function normalizeLocale(locale: string | null | undefined): AppLocale | null {
  if (!locale) {
    return null;
  }

  const normalized = locale.trim().replace(/_/g, "-");
  const lowerCased = normalized.toLowerCase();

  if (lowerCased === "zh") {
    return "zh-Hans";
  }

  if (lowerCased.startsWith("zh-hans")) {
    return "zh-Hans";
  }

  if (lowerCased.startsWith("zh-hant")) {
    return "zh-Hant";
  }

  const [language, regionOrScript] = lowerCased.split("-");

  switch (language) {
    case "zh":
      if (!regionOrScript || CHINESE_SIMPLIFIED_REGIONS.has(regionOrScript)) {
        return "zh-Hans";
      }

      if (CHINESE_TRADITIONAL_REGIONS.has(regionOrScript)) {
        return "zh-Hant";
      }

      return "zh-Hans";
    case "ko":
      return "ko";
    case "en":
    case "es":
    case "fr":
    case "de":
    case "pt":
    case "ja":
      return language;
    default:
      return null;
  }
}

export function getStoredLocale(): AppLocale | null {
  return normalizeLocale(safeGetStoredValue(LOCALE_STORAGE_KEY));
}

export function setStoredLocale(locale: AppLocale): void {
  safeSetStoredValue(LOCALE_STORAGE_KEY, locale);
}

export function detectBrowserLocale(source?: LanguageSource): AppLocale | null {
  const languageSource = source ?? (typeof navigator !== "undefined" ? navigator : undefined);
  if (!languageSource) {
    return null;
  }

  const candidates = languageSource.languages?.length
    ? languageSource.languages
    : languageSource.language
      ? [languageSource.language]
      : [];

  for (const candidate of candidates) {
    const normalized = normalizeLocale(candidate);
    if (normalized) {
      return normalized;
    }
  }

  return null;
}

export function resolveInitialLocale(): AppLocale {
  return getStoredLocale() ?? detectBrowserLocale() ?? DEFAULT_LOCALE;
}

export function setDocumentLanguage(locale: string): void {
  if (typeof document === "undefined") {
    return;
  }

  document.documentElement.lang = normalizeLocale(locale) ?? DEFAULT_LOCALE;
}
