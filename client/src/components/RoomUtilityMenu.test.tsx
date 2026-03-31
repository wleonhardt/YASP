import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import i18n from "../i18n";
import { RoomUtilityMenu } from "./RoomUtilityMenu";

describe("RoomUtilityMenu", () => {
  afterEach(async () => {
    await i18n.changeLanguage("en");
  });

  it("opens from the utility trigger and closes on Escape while returning focus", async () => {
    const user = userEvent.setup();

    render(<RoomUtilityMenu status="connected" />);

    const trigger = screen.getByRole("button", { name: /open session preferences/i });
    await user.click(trigger);

    expect(screen.getByRole("dialog", { name: /session preferences/i })).toBeInTheDocument();

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog", { name: /session preferences/i })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("toggles closed when the trigger is pressed again", async () => {
    const user = userEvent.setup();

    render(<RoomUtilityMenu status="disconnected" />);

    const trigger = screen.getByRole("button", { name: /open session preferences/i });
    await user.click(trigger);
    expect(screen.getByRole("dialog", { name: /session preferences/i })).toBeInTheDocument();

    await user.click(trigger);
    expect(screen.queryByRole("dialog", { name: /session preferences/i })).not.toBeInTheDocument();
  });

  it("closes from the backdrop and returns focus to the trigger", async () => {
    const user = userEvent.setup();

    render(<RoomUtilityMenu status="connecting" />);

    const trigger = screen.getByRole("button", { name: /open session preferences/i });
    await user.click(trigger);
    expect(screen.getByRole("dialog", { name: /session preferences/i })).toBeInTheDocument();

    await user.click(document.querySelector(".room-utility__backdrop") as HTMLElement);

    expect(screen.queryByRole("dialog", { name: /session preferences/i })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it.each([
    [
      "en",
      "Open session preferences — Connected",
      "Session preferences",
      "Session status",
      "Appearance",
      "Connected",
    ],
    [
      "es",
      "Abrir preferencias de la sesión — Conectado",
      "Preferencias de la sesión",
      "Estado de la sesión",
      "Apariencia",
      "Conectado",
    ],
    [
      "fr",
      "Ouvrir les préférences de la session — Connecté",
      "Préférences de la session",
      "État de la session",
      "Apparence",
      "Connecté",
    ],
    [
      "de",
      "Sitzungseinstellungen öffnen — Verbunden",
      "Sitzungseinstellungen",
      "Sitzungsstatus",
      "Darstellung",
      "Verbunden",
    ],
    [
      "pt",
      "Abrir as preferências da sessão — Conectado",
      "Preferências da sessão",
      "Estado da sessão",
      "Aspeto",
      "Conectado",
    ],
    ["ja", "セッション設定を開く — 接続済み", "セッション設定", "セッション状態", "表示", "接続済み"],
    ["ko", "세션 설정 열기 — 연결됨", "세션 설정", "세션 상태", "표시", "연결됨"],
    ["zh-Hans", "打开会话偏好 — 已连接", "会话偏好", "会话状态", "外观", "已连接"],
    ["zh-Hant", "開啟工作階段偏好 — 已連線", "工作階段偏好", "工作階段狀態", "外觀", "已連線"],
  ] as const)(
    "renders localized utility labels in %s",
    async (locale, triggerLabel, title, sessionStatus, appearance, connected) => {
      await i18n.changeLanguage(locale);
      const user = userEvent.setup();

      render(<RoomUtilityMenu status="connected" />);

      const trigger = screen.getByRole("button", { name: triggerLabel });
      expect(trigger).toBeInTheDocument();

      await user.click(trigger);

      const dialog = screen.getByRole("dialog", { name: title });
      const dialogScope = within(dialog);

      expect(dialogScope.getByText(sessionStatus)).toBeInTheDocument();
      expect(dialogScope.getByText(appearance)).toBeInTheDocument();
      expect(dialogScope.getAllByText(connected).length).toBeGreaterThan(0);
    }
  );
});
