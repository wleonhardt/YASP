import { beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_LOCALE,
  detectBrowserLocale,
  getStoredLocale,
  normalizeLocale,
  resolveInitialLocale,
  setStoredLocale,
  SUPPORTED_LOCALES,
} from "./config";

function createStorageMock() {
  const store = new Map<string, string>();

  return {
    getItem(key: string) {
      return store.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
  };
}

describe("i18n locale helpers", () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: createStorageMock(),
    });
  });

  it("normalizes supported locales down to the language code", () => {
    expect(normalizeLocale("es-MX")).toBe("es");
    expect(normalizeLocale("en-US")).toBe("en");
    expect(normalizeLocale("fr-CA")).toBe("fr");
    expect(normalizeLocale("de-AT")).toBe("de");
    expect(normalizeLocale("pt-BR")).toBe("pt");
    expect(normalizeLocale("pt_BR")).toBe("pt");
    expect(normalizeLocale("ja-JP")).toBe("ja");
    expect(normalizeLocale("ko-KR")).toBe("ko");
    expect(normalizeLocale("zh")).toBe("zh-Hans");
    expect(normalizeLocale("zh-CN")).toBe("zh-Hans");
    expect(normalizeLocale("zh-SG")).toBe("zh-Hans");
    expect(normalizeLocale("zh-Hans-CN")).toBe("zh-Hans");
    expect(normalizeLocale("zh-TW")).toBe("zh-Hant");
    expect(normalizeLocale("zh-HK")).toBe("zh-Hant");
    expect(normalizeLocale("zh-MO")).toBe("zh-Hant");
    expect(normalizeLocale("zh-Hant-TW")).toBe("zh-Hant");
    expect(normalizeLocale("it-IT")).toBeNull();
  });

  it("detects only supported browser locales", () => {
    expect(detectBrowserLocale({ languages: ["es-ES", "fr-FR"] })).toBe("es");
    expect(detectBrowserLocale({ language: "en-GB" })).toBe("en");
    expect(detectBrowserLocale({ languages: ["fr-CA", "it-IT"] })).toBe("fr");
    expect(detectBrowserLocale({ languages: ["it-IT", "de-AT"] })).toBe("de");
    expect(detectBrowserLocale({ languages: ["it-IT", "pt-BR"] })).toBe("pt");
    expect(detectBrowserLocale({ languages: ["ja-JP"] })).toBe("ja");
    expect(detectBrowserLocale({ languages: ["ko-KR"] })).toBe("ko");
    expect(detectBrowserLocale({ languages: ["zh-CN"] })).toBe("zh-Hans");
    expect(detectBrowserLocale({ languages: ["zh-TW"] })).toBe("zh-Hant");
    expect(detectBrowserLocale({ languages: ["zh-HK"] })).toBe("zh-Hant");
    expect(detectBrowserLocale({ languages: ["zh"] })).toBe("zh-Hans");
    expect(detectBrowserLocale({ languages: ["it-IT", "nl-NL"] })).toBeNull();
  });

  it("persists the selected locale in localStorage", () => {
    expect(getStoredLocale()).toBeNull();
    setStoredLocale("es");
    expect(getStoredLocale()).toBe("es");
  });

  it("prefers the stored locale over browser detection", () => {
    setStoredLocale("es");
    expect(resolveInitialLocale()).toBe("es");
  });

  it("exports all supported locales with English as the default", () => {
    expect(SUPPORTED_LOCALES).toEqual(["en", "es", "fr", "de", "pt", "ja", "ko", "zh-Hans", "zh-Hant"]);
    expect(DEFAULT_LOCALE).toBe("en");
  });
});
