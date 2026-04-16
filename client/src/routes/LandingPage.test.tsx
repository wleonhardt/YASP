import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "../i18n";
import { LandingPage } from "./LandingPage";

type MockConnectionState = {
  socket: never;
  status: "connected" | "connecting" | "reconnecting" | "offline" | "failed";
  compatibilityMode: boolean;
  showRecoveryNotice: boolean;
  diagnostics: {
    status: "connected" | "connecting" | "reconnecting" | "offline" | "failed";
    compatibilityMode: boolean;
    transport: "websocket" | "polling" | "unknown";
    online: boolean;
    retryCount: number;
    lastError: string | null;
    lastConnectedAt: number | null;
    healthStatus: "unknown" | "reachable" | "unreachable";
    problem: "none" | "offline" | "realtime_blocked" | "transport_failed" | "backend_unreachable" | "unknown";
    endpoint: string;
    origin: string | null;
  };
  retry: ReturnType<typeof vi.fn>;
  enableCompatibilityMode: ReturnType<typeof vi.fn>;
  disableCompatibilityMode: ReturnType<typeof vi.fn>;
};

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  createRoom: vi.fn(),
  joinRoom: vi.fn(),
  retry: vi.fn(),
  enableCompatibilityMode: vi.fn(),
  disableCompatibilityMode: vi.fn(),
  connection: {
    socket: {} as never,
    status: "connected",
    compatibilityMode: false,
    showRecoveryNotice: false,
    diagnostics: {
      status: "connected",
      compatibilityMode: false,
      transport: "websocket",
      online: true,
      retryCount: 0,
      lastError: null,
      lastConnectedAt: null,
      healthStatus: "unknown",
      problem: "none",
      endpoint: "http://localhost:3001",
      origin: "http://localhost:5173",
    },
    retry: vi.fn(),
    enableCompatibilityMode: vi.fn(),
    disableCompatibilityMode: vi.fn(),
  } as MockConnectionState,
}));

vi.mock("react-router-dom", () => ({
  useNavigate: () => mocks.navigate,
}));

vi.mock("../hooks/useSocket", () => ({
  useSocket: () => mocks.connection,
}));

vi.mock("../hooks/useSession", () => ({
  useSession: () => ({
    sessionId: "session-1",
    storedName: "",
  }),
}));

vi.mock("../hooks/useRoom", () => ({
  useRoom: () => ({
    createRoom: mocks.createRoom,
    joinRoom: mocks.joinRoom,
    error: null,
  }),
}));

describe("LandingPage create room deck behavior", () => {
  beforeEach(() => {
    mocks.navigate.mockReset();
    mocks.createRoom.mockReset();
    mocks.joinRoom.mockReset();
    mocks.retry.mockReset();
    mocks.enableCompatibilityMode.mockReset();
    mocks.disableCompatibilityMode.mockReset();

    mocks.connection.socket = {} as never;
    mocks.connection.status = "connected";
    mocks.connection.compatibilityMode = false;
    mocks.connection.showRecoveryNotice = false;
    mocks.connection.diagnostics = {
      status: "connected",
      compatibilityMode: false,
      transport: "websocket",
      online: true,
      retryCount: 0,
      lastError: null,
      lastConnectedAt: null,
      healthStatus: "unknown",
      problem: "none",
      endpoint: "http://localhost:3001",
      origin: "http://localhost:5173",
    };
    mocks.connection.retry = mocks.retry;
    mocks.connection.enableCompatibilityMode = mocks.enableCompatibilityMode;
    mocks.connection.disableCompatibilityMode = mocks.disableCompatibilityMode;

    mocks.createRoom.mockResolvedValue({
      ok: true,
      data: {
        roomId: "ABCD12",
        state: {} as never,
      },
    });
  });

  it("keeps the default create-room payload when no customization is applied", async () => {
    const user = userEvent.setup();
    render(<LandingPage />);

    await user.type(screen.getByPlaceholderText("Enter your display name"), "Taylor");

    const createForm = screen.getByRole("button", { name: "Create room" }).closest("form");
    if (!createForm) {
      throw new Error("Create room form not found");
    }

    await user.selectOptions(within(createForm).getByRole("combobox"), "powers_of_two");
    await user.click(within(createForm).getByRole("button", { name: "Create room" }));

    await waitFor(() => {
      expect(mocks.createRoom).toHaveBeenCalledWith("Taylor", "voter", {
        type: "powers_of_two",
      });
    });
  });

  it("sends a custom DeckInput only after the user applies customization", async () => {
    const user = userEvent.setup();
    render(<LandingPage />);

    await user.type(screen.getByPlaceholderText("Enter your display name"), "Taylor");

    await user.click(screen.getByRole("button", { name: "Customize" }));
    await user.click(screen.getByRole("tab", { name: "Custom" }));
    await user.type(screen.getByLabelText("Cards"), "1 2 3 5");
    await user.click(screen.getByRole("button", { name: "Use deck" }));

    expect(
      screen.getByText((_, node) => node?.textContent === "Using custom deck: Custom · ? on · Coffee off")
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Create room" }));

    await waitFor(() => {
      expect(mocks.createRoom).toHaveBeenCalledWith("Taylor", "voter", {
        type: "custom",
        label: "Custom",
        cards: ["1", "2", "3", "5", "?"],
      });
    });
  });

  it("clears a custom override when the base deck select changes", async () => {
    const user = userEvent.setup();
    render(<LandingPage />);

    await user.type(screen.getByPlaceholderText("Enter your display name"), "Taylor");

    await user.click(screen.getByRole("button", { name: "Customize" }));
    await user.click(screen.getByRole("tab", { name: "Custom" }));
    await user.type(screen.getByLabelText("Cards"), "1 2 3 5");
    await user.click(screen.getByRole("button", { name: "Use deck" }));

    expect(screen.getByText(/Using custom deck:/)).toBeInTheDocument();

    const createForm = screen.getByRole("button", { name: "Create room" }).closest("form");
    if (!createForm) {
      throw new Error("Create room form not found");
    }

    await user.selectOptions(within(createForm).getByRole("combobox"), "modified_fibonacci");

    expect(screen.queryByText(/Using custom deck:/)).not.toBeInTheDocument();

    await user.click(within(createForm).getByRole("button", { name: "Create room" }));

    await waitFor(() => {
      expect(mocks.createRoom).toHaveBeenCalledWith("Taylor", "voter", {
        type: "modified_fibonacci",
      });
    });
  });

  it("supports arrow-key navigation for the role picker", async () => {
    const user = userEvent.setup();
    render(<LandingPage />);

    const voter = screen.getByRole("radio", { name: /Voter/i });
    const spectator = screen.getByRole("radio", { name: /Spectator/i });

    voter.focus();
    await user.keyboard("{ArrowRight}");

    expect(spectator).toHaveFocus();
    expect(spectator).toHaveAttribute("aria-checked", "true");
    expect(voter).toHaveAttribute("tabindex", "-1");
    expect(spectator).toHaveAttribute("tabindex", "0");
  });

  it.each([
    ["es", "Crear sala", "Unirse a una sala", "Personalizar", "¿Quién se une?"],
    ["fr", "Créer une salle", "Rejoindre une salle", "Personnaliser", "Qui rejoint la salle ?"],
    ["de", "Raum erstellen", "Raum beitreten", "Anpassen", "Wer ist dabei?"],
    ["pt", "Criar sala", "Entrar na sala", "Personalizar", "Quem vai entrar?"],
    ["ja", "ルームを作成", "ルームに参加", "カスタマイズ", "誰が参加しますか？"],
    ["ko", "룸 만들기", "룸 참가", "커스텀", "참가자"],
    ["zh-Hans", "创建房间", "加入房间", "自定义", "谁要加入？"],
    ["zh-Hant", "建立房間", "加入房間", "自訂", "誰要加入？"],
  ] as const)(
    "renders the migrated landing copy in %s",
    async (locale, createLabel, joinLabel, customizeLabel, identityTitle) => {
      await i18n.changeLanguage(locale);

      render(<LandingPage />);

      expect(screen.getByRole("button", { name: createLabel })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: joinLabel })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: customizeLabel })).toBeInTheDocument();
      expect(screen.getByText(identityTitle)).toBeInTheDocument();
    }
  );

  it("keeps the happy path clean when connected", () => {
    render(<LandingPage />);

    expect(screen.queryByRole("heading", { name: "Realtime connection failed" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
  });

  it("shows recovery actions when realtime is unavailable", () => {
    mocks.connection.status = "failed";
    mocks.connection.showRecoveryNotice = true;
    mocks.connection.diagnostics = {
      ...mocks.connection.diagnostics,
      status: "failed",
      retryCount: 3,
      lastError: "xhr poll error",
      healthStatus: "reachable",
      problem: "realtime_blocked",
    };

    render(<LandingPage />);

    expect(screen.getByRole("heading", { name: "Realtime connection failed" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try compatibility mode" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Connection details" })).toBeInTheDocument();
    expect(
      screen.getByText(
        "Use this if the page loads but live updates stay disconnected. Some networks or browser extensions can block realtime connections."
      )
    ).toBeInTheDocument();
  });

  it("keeps the first bootstrap render quiet while the connection is still initializing", () => {
    mocks.connection.status = "connecting";
    mocks.connection.showRecoveryNotice = false;
    mocks.connection.diagnostics = {
      ...mocks.connection.diagnostics,
      status: "connecting",
    };

    render(<LandingPage />);

    expect(screen.queryByRole("heading", { name: "Connecting to realtime" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try compatibility mode" })).not.toBeInTheDocument();
  });

  it("keeps the recovery notice hidden during bootstrap when compatibility mode was reused", () => {
    mocks.connection.status = "connecting";
    mocks.connection.compatibilityMode = true;
    mocks.connection.showRecoveryNotice = false;
    mocks.connection.diagnostics = {
      ...mocks.connection.diagnostics,
      status: "connecting",
      compatibilityMode: true,
      transport: "polling",
    };

    render(<LandingPage />);

    expect(screen.queryByRole("heading", { name: "Connecting to realtime" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try compatibility mode" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Use default mode" })).not.toBeInTheDocument();
  });
});
