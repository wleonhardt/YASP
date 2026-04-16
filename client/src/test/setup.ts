import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";
import i18n from "../i18n";

function resetBrowserTestState(): void {
  vi.restoreAllMocks();
  if (typeof window !== "undefined" && typeof window.localStorage?.clear === "function") {
    window.localStorage.clear();
  }
  if (typeof window !== "undefined" && typeof window.sessionStorage?.clear === "function") {
    window.sessionStorage.clear();
  }
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.lang = "en";
}

beforeEach(async () => {
  resetBrowserTestState();
  await i18n.changeLanguage("en");
});

afterEach(async () => {
  cleanup();
  resetBrowserTestState();
  await i18n.changeLanguage("en");
});
