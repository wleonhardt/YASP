import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import {
  DEFAULT_LOCALE,
  normalizeLocale,
  resolveInitialLocale,
  setDocumentLanguage,
  setStoredLocale,
  SUPPORTED_LOCALES,
} from "./config";
import deCommon from "./locales/de/common.json";
import enCommon from "./locales/en/common.json";
import esCommon from "./locales/es/common.json";
import frCommon from "./locales/fr/common.json";
import jaCommon from "./locales/ja/common.json";
import koCommon from "./locales/ko/common.json";
import ptCommon from "./locales/pt/common.json";
import zhHansCommon from "./locales/zh-Hans/common.json";
import zhHantCommon from "./locales/zh-Hant/common.json";

const resources = {
  de: {
    common: deCommon,
  },
  en: {
    common: enCommon,
  },
  es: {
    common: esCommon,
  },
  fr: {
    common: frCommon,
  },
  ja: {
    common: jaCommon,
  },
  ko: {
    common: koCommon,
  },
  pt: {
    common: ptCommon,
  },
  "zh-Hans": {
    common: zhHansCommon,
  },
  "zh-Hant": {
    common: zhHantCommon,
  },
} as const satisfies Record<(typeof SUPPORTED_LOCALES)[number], { common: typeof enCommon }>;

if (!i18n.isInitialized) {
  void i18n.use(initReactI18next).init({
    resources,
    lng: resolveInitialLocale(),
    fallbackLng: DEFAULT_LOCALE,
    supportedLngs: SUPPORTED_LOCALES,
    defaultNS: "common",
    ns: ["common"],
    interpolation: {
      escapeValue: false,
    },
    react: {
      useSuspense: false,
    },
    returnNull: false,
  });

  setDocumentLanguage(i18n.resolvedLanguage ?? DEFAULT_LOCALE);
  i18n.on("languageChanged", (language) => {
    const locale = normalizeLocale(language) ?? DEFAULT_LOCALE;
    setStoredLocale(locale);
    setDocumentLanguage(locale);
  });
}

export { resources };
export default i18n;
