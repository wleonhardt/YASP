import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { LanguageSwitcher } from "./LanguageSwitcher";
import i18n from "../i18n";

describe("LanguageSwitcher", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
  });

  it("renders all supported locale options with stable accessible names", () => {
    render(<LanguageSwitcher compact />);

    const switcher = screen.getByRole("combobox", { name: "Language" });

    expect(switcher).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "English" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Español" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Français" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Deutsch" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Português" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "日本語" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "한국어" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "简体中文" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "繁體中文" })).toBeInTheDocument();
  });
});
