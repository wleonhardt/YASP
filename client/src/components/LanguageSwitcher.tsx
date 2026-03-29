import { useTranslation } from "react-i18next";
import { DEFAULT_LOCALE, normalizeLocale, SUPPORTED_LOCALES } from "../i18n/config";

type Props = {
  compact?: boolean;
};

export function LanguageSwitcher({ compact = false }: Props) {
  const { i18n, t } = useTranslation();
  const currentLanguage = normalizeLocale(i18n.resolvedLanguage) ?? DEFAULT_LOCALE;

  return (
    <label
      className={["language-switcher", compact ? "language-switcher--compact" : ""].filter(Boolean).join(" ")}
    >
      <span className="sr-only">{t("language.label")}</span>
      <select
        className="language-switcher__select"
        aria-label={t("language.label")}
        value={currentLanguage}
        onChange={(event) => void i18n.changeLanguage(event.target.value)}
      >
        {SUPPORTED_LOCALES.map((locale) => (
          <option key={locale} value={locale}>
            {t(`language.option.${locale}`)}
          </option>
        ))}
      </select>
      <span className="language-switcher__chevron" aria-hidden="true">
        ▾
      </span>
    </label>
  );
}
