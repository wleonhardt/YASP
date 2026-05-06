import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import i18n from "../i18n";
import { getStoredTimerSoundEnabled, setStoredTimerSoundEnabled } from "../lib/storage";
import { RoomUtilityMenu } from "./RoomUtilityMenu";

const audioMocks = vi.hoisted(() => ({
  primeRoomAudio: vi.fn().mockResolvedValue(true),
}));

vi.mock("../lib/audio", () => audioMocks);

describe("RoomUtilityMenu", () => {
  const originalMatchMedia = window.matchMedia;

  const mockMatchMedia = (matches: boolean) => {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  };

  afterEach(async () => {
    window.localStorage.clear();
    vi.clearAllMocks();
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: originalMatchMedia,
    });
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

  it("moves focus into the session preferences dialog on open", async () => {
    const user = userEvent.setup();

    render(<RoomUtilityMenu status="connected" />);

    await user.click(screen.getByRole("button", { name: /open session preferences/i }));

    expect(screen.getByRole("dialog", { name: /session preferences/i })).toHaveFocus();
  });

  it("toggles closed when the trigger is pressed again", async () => {
    const user = userEvent.setup();

    render(<RoomUtilityMenu status="failed" />);

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
    ["zh-Hans", "打开会话偏好 — 已连接", "偏好设置", "会话状态", "外观", "已连接"],
    ["zh-Hant", "開啟工作階段偏好 — 已連線", "偏好設定", "工作階段狀態", "外觀", "已連線"],
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

  it('uses the visible "Live" label in the trigger accessible name on narrow screens', () => {
    mockMatchMedia(true);

    render(<RoomUtilityMenu status="connected" />);

    expect(screen.getByRole("button", { name: "Open session preferences — Live" })).toBeInTheDocument();
  });

  it("shows compatibility mode messaging when fallback transport is active", async () => {
    const user = userEvent.setup();

    render(<RoomUtilityMenu status="reconnecting" compatibilityMode />);

    const trigger = screen.getByRole("button", { name: /open session preferences/i });
    expect(screen.getByLabelText("Compatibility mode active")).toBeInTheDocument();

    await user.click(trigger);

    const dialog = screen.getByRole("dialog", { name: /session preferences/i });
    expect(within(dialog).getByText("Compatibility mode active")).toBeInTheDocument();
  });

  it("opens optional moderator controls from the session preferences dialog", async () => {
    const user = userEvent.setup();

    render(<RoomUtilityMenu status="connected" moderatorControls={<div>Timer settings live here</div>} />);

    await user.click(screen.getByRole("button", { name: /open session preferences/i }));

    const preferencesDialog = screen.getByRole("dialog", { name: /session preferences/i });
    const trigger = within(preferencesDialog).getByRole("button", { name: /moderator controls/i });
    expect(trigger).toHaveClass("moderator-drawer__trigger--menu");

    await user.click(trigger);

    const moderatorDialog = screen.getByRole("dialog", { name: /moderator controls/i });
    expect(within(moderatorDialog).getByText("Timer settings live here")).toBeInTheDocument();
  });

  it("toggles timer sound preference from the session preferences dialog", async () => {
    const user = userEvent.setup();
    setStoredTimerSoundEnabled(false);

    render(<RoomUtilityMenu status="connected" />);

    await user.click(screen.getByRole("button", { name: /open session preferences/i }));
    await user.click(screen.getByRole("button", { name: /sound off/i }));

    expect(audioMocks.primeRoomAudio).toHaveBeenCalledTimes(1);
    expect(getStoredTimerSoundEnabled()).toBe(true);
    expect(screen.getByRole("button", { name: /sound on/i })).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("button", { name: /sound on/i }));

    await waitFor(() => expect(getStoredTimerSoundEnabled()).toBe(false));
    expect(screen.getByRole("button", { name: /sound off/i })).toHaveAttribute("aria-pressed", "false");
  });
});
