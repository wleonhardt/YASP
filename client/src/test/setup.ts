import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import i18n from "../i18n";

afterEach(async () => {
  cleanup();
  await i18n.changeLanguage("en");
  if (typeof window !== "undefined" && typeof window.localStorage?.clear === "function") {
    window.localStorage.clear();
  }
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.lang = "en";
});
