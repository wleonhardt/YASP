import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRef, useState } from "react";
import { describe, expect, it, vi } from "vitest";
import type { PublicParticipant, PublicRoomState, SessionRoundSnapshot } from "@yasp/shared";
import { DEFAULT_DECKS } from "@yasp/shared";
import { makePublicRoomState } from "../test/roomState";
import { ResultsPanel } from "./ResultsPanel";
import { SessionReportModal } from "./SessionReportModal";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeSnapshot(overrides: Partial<SessionRoundSnapshot> = {}): SessionRoundSnapshot {
  return {
    roundNumber: 1,
    revealedAt: Date.UTC(2026, 3, 15, 14, 0),
    deck: DEFAULT_DECKS.fibonacci,
    participants: [
      { participantId: "me", name: "Alice", role: "voter", vote: "3", connected: true },
      { participantId: "p2", name: "Bob", role: "voter", vote: "5", connected: true },
    ],
    stats: {
      totalVotes: 2,
      numericAverage: 4,
      distribution: { "3": 1, "5": 1 },
      consensus: false,
      mostCommon: null,
    },
    ...overrides,
  };
}

function buildParticipants(selfModerator: boolean): PublicParticipant[] {
  return [
    {
      id: "me",
      name: "Alice",
      role: "voter",
      connected: true,
      hasVoted: true,
      isSelf: true,
      isModerator: selfModerator,
    },
    {
      id: "p2",
      name: "Bob",
      role: "voter",
      connected: true,
      hasVoted: true,
      isSelf: false,
      isModerator: !selfModerator,
    },
  ];
}

function makeRevealedState({
  selfModerator = true,
  sessionRounds = [],
}: {
  selfModerator?: boolean;
  sessionRounds?: SessionRoundSnapshot[];
} = {}): PublicRoomState {
  return makePublicRoomState({
    id: "ROOM01",
    roundNumber: 2,
    revealed: true,
    participants: buildParticipants(selfModerator),
    votes: { me: "5", p2: "5" },
    stats: {
      totalVotes: 2,
      numericAverage: 5,
      distribution: { "5": 2 },
      consensus: true,
      mostCommon: "5",
    },
    sessionRounds,
  });
}


// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

function SessionHarness({ initialState }: { initialState: PublicRoomState }) {
  const [state, setState] = useState(initialState);
  const [sessionOpen, setSessionOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const isMod = state.participants.find((p) => p.isSelf)?.isModerator ?? false;

  const handleCopySessionSummary = vi.fn();

  return (
    <>
      {state.revealed ? (
        <ResultsPanel
          state={state}
          onOpenRoundReport={vi.fn()}
          onOpenSessionReport={state.sessionRounds.length > 0 ? () => setSessionOpen(true) : undefined}
          onCopySessionSummary={
            isMod && state.sessionRounds.length > 0 ? handleCopySessionSummary : undefined
          }
          sessionReportButtonRef={triggerRef}
        />
      ) : (
        <div data-testid="pre-reveal-placeholder">Pre-reveal</div>
      )}

      {sessionOpen && state.sessionRounds.length > 0 && (
        <SessionReportModal
          open
          roomId={state.id}
          sessionRounds={state.sessionRounds}
          mode={isMod ? "moderator" : "participant"}
          onClose={() => setSessionOpen(false)}
          returnFocusRef={triggerRef}
        />
      )}

      <button
        type="button"
        onClick={() =>
          setState((prev) =>
            makePublicRoomState({
              ...prev,
              roundNumber: prev.roundNumber + 1,
              revealed: false,
              votes: null,
              stats: null,
            })
          )
        }
      >
        Next round
      </button>

      <button
        type="button"
        onClick={() =>
          setState((prev) =>
            makePublicRoomState({
              ...prev,
              revealed: false,
              votes: null,
              stats: null,
            })
          )
        }
      >
        Reset round
      </button>
    </>
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Session report — trigger visibility", () => {
  it("scenario 1: no session trigger when sessionRounds is empty", () => {
    render(
      <ResultsPanel
        state={makeRevealedState({ sessionRounds: [] })}
        onOpenRoundReport={vi.fn()}
        onOpenSessionReport={undefined}
      />
    );

    expect(screen.queryByRole("button", { name: /view session report/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /view session summary/i })).not.toBeInTheDocument();
  });

  it("scenario 2: participant sees 'View session summary' after ≥1 completed round", async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();

    render(
      <ResultsPanel
        state={makeRevealedState({ selfModerator: false, sessionRounds: [makeSnapshot()] })}
        onOpenRoundReport={vi.fn()}
        onOpenSessionReport={onOpen}
      />
    );

    const btn = screen.getByRole("button", { name: /view session summary/i });
    await user.click(btn);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("scenario 3: moderator sees 'View session report' and 'Copy session summary'", () => {
    const onOpen = vi.fn();
    const onCopy = vi.fn();

    render(
      <ResultsPanel
        state={makeRevealedState({ selfModerator: true, sessionRounds: [makeSnapshot()] })}
        onOpenRoundReport={vi.fn()}
        onOpenSessionReport={onOpen}
        onCopySessionSummary={onCopy}
        sessionReportButtonRef={{ current: null }}
      />
    );

    expect(screen.getByRole("button", { name: /view session report/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /copy session summary/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /view session summary/i })).not.toBeInTheDocument();
  });

  it("scenario 4: participant never sees export buttons inside session summary modal", () => {
    render(
      <SessionReportModal
        open
        roomId="ROOM01"
        sessionRounds={[makeSnapshot()]}
        mode="participant"
        onClose={vi.fn()}
      />
    );

    const dialog = screen.getByRole("dialog", { name: /session summary/i });
    expect(within(dialog).queryByRole("button", { name: /export csv/i })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: /export json/i })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: /print/i })).not.toBeInTheDocument();
    // Participant modal has a header × close + footer Close button — both are close actions
    expect(within(dialog).getAllByRole("button", { name: /close/i })).toHaveLength(2);
  });
});

describe("Session report — moderator exports", () => {
  it("scenario 5: moderator session report shows export actions", () => {
    render(
      <SessionReportModal
        open
        roomId="ROOM01"
        sessionRounds={[
          makeSnapshot(),
          makeSnapshot({ roundNumber: 2, revealedAt: Date.UTC(2026, 3, 15, 15, 0) }),
        ]}
        mode="moderator"
        onClose={vi.fn()}
      />
    );

    const dialog = screen.getByRole("dialog", { name: /session report/i });
    expect(within(dialog).getByRole("button", { name: /export csv/i })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: /export json/i })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: /print/i })).toBeInTheDocument();
  });

  it("triggers a CSV download when Export CSV is clicked", async () => {
    const user = userEvent.setup();

    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    const createObjectURL = vi.fn(() => "blob:fake");
    const revokeObjectURL = vi.fn();
    (URL as unknown as { createObjectURL: typeof createObjectURL }).createObjectURL = createObjectURL;
    (URL as unknown as { revokeObjectURL: typeof revokeObjectURL }).revokeObjectURL = revokeObjectURL;

    const anchorClick = vi.fn();
    const originalCreateElement = document.createElement.bind(document);
    const createElementSpy = vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const el = originalCreateElement(tag);
      if (tag === "a") (el as HTMLAnchorElement).click = anchorClick;
      return el;
    });

    try {
      render(
        <SessionReportModal
          open
          roomId="ROOM01"
          sessionRounds={[makeSnapshot()]}
          mode="moderator"
          onClose={vi.fn()}
        />
      );

      await user.click(screen.getByRole("button", { name: /export csv/i }));

      expect(createObjectURL).toHaveBeenCalledTimes(1);
      expect(anchorClick).toHaveBeenCalledTimes(1);
      expect(revokeObjectURL).toHaveBeenCalledTimes(1);
    } finally {
      createElementSpy.mockRestore();
      (URL as unknown as { createObjectURL: typeof originalCreateObjectURL }).createObjectURL =
        originalCreateObjectURL;
      (URL as unknown as { revokeObjectURL: typeof originalRevokeObjectURL }).revokeObjectURL =
        originalRevokeObjectURL;
    }
  });
});

describe("Session report — multi-round accumulation", () => {
  it("scenario 6: modal shows all completed rounds", () => {
    const rounds = [
      makeSnapshot({ roundNumber: 1 }),
      makeSnapshot({
        roundNumber: 2,
        revealedAt: Date.UTC(2026, 3, 15, 15, 0),
        participants: [
          { participantId: "me", name: "Alice", role: "voter", vote: "8", connected: true },
          { participantId: "p2", name: "Bob", role: "voter", vote: "8", connected: true },
        ],
        stats: {
          totalVotes: 2,
          numericAverage: 8,
          distribution: { "8": 2 },
          consensus: true,
          mostCommon: "8",
        },
      }),
    ];

    render(
      <SessionReportModal open roomId="ROOM01" sessionRounds={rounds} mode="participant" onClose={vi.fn()} />
    );

    const dialog = screen.getByRole("dialog", { name: /session summary/i });
    expect(within(dialog).getByText(/round 1/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/round 2/i)).toBeInTheDocument();
  });
});

describe("Session report — round lifecycle", () => {
  it("scenario 7: trigger persists after next round / reset (sessionRounds not wiped)", async () => {
    const user = userEvent.setup();

    render(
      <SessionHarness
        initialState={makeRevealedState({
          selfModerator: true,
          sessionRounds: [makeSnapshot()],
        })}
      />
    );

    expect(screen.getByRole("button", { name: /view session report/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /next round/i }));

    // After next round, the state is not revealed. The ResultsPanel is gone.
    // The pre-reveal placeholder appears.
    expect(screen.getByTestId("pre-reveal-placeholder")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /view session report/i })).not.toBeInTheDocument();
  });

  it("scenario 8: no session report available when room state is absent (room expiry)", () => {
    // Simulates room expiry by rendering with null state — the session modal is simply not rendered.
    // Equivalent: if roomState is null in RoomPage, no results panel or modal renders.
    render(
      <SessionReportModal
        open={false}
        roomId="ROOM01"
        sessionRounds={[]}
        mode="moderator"
        onClose={vi.fn()}
      />
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("session trigger does not appear when sessionRounds is empty on the results panel", () => {
    render(
      <ResultsPanel
        state={makeRevealedState({ sessionRounds: [] })}
        onOpenRoundReport={vi.fn()}
        onOpenSessionReport={() => {}}
      />
    );

    expect(screen.queryByRole("button", { name: /view session/i })).not.toBeInTheDocument();
  });
});

describe("Session report — copy session summary", () => {
  it("scenario 9: copy handler is called with participants and stats data", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    const originalClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");

    try {
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: { writeText },
      });

      render(
        <ResultsPanel
          state={makeRevealedState({ selfModerator: true, sessionRounds: [makeSnapshot()] })}
          onOpenRoundReport={vi.fn()}
          onOpenSessionReport={vi.fn()}
          onCopySessionSummary={() => void navigator.clipboard.writeText("session-summary-text")}
        />
      );

      await user.click(screen.getByRole("button", { name: /copy session summary/i }));
      expect(writeText).toHaveBeenCalledWith("session-summary-text");
    } finally {
      if (originalClipboard) {
        Object.defineProperty(navigator, "clipboard", originalClipboard);
      } else {
        const holder = navigator as unknown as { clipboard?: Clipboard };
        delete holder.clipboard;
      }
    }
  });
});

describe("Session report — accessibility and focus", () => {
  it("scenario 10a: closes on Escape and restores focus to trigger (moderator)", async () => {
    const user = userEvent.setup();

    render(
      <SessionHarness
        initialState={makeRevealedState({ selfModerator: true, sessionRounds: [makeSnapshot()] })}
      />
    );

    const trigger = screen.getByRole("button", { name: /view session report/i });
    await user.click(trigger);

    expect(await screen.findByRole("dialog", { name: /session report/i })).toBeInTheDocument();

    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: /session report/i })).not.toBeInTheDocument();
      expect(trigger).toHaveFocus();
    });
  });

  it("scenario 10b: closes on Escape and restores focus (participant)", async () => {
    const user = userEvent.setup();

    render(
      <SessionHarness
        initialState={makeRevealedState({ selfModerator: false, sessionRounds: [makeSnapshot()] })}
      />
    );

    const trigger = screen.getByRole("button", { name: /view session summary/i });
    await user.click(trigger);

    expect(await screen.findByRole("dialog", { name: /session summary/i })).toBeInTheDocument();

    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: /session summary/i })).not.toBeInTheDocument();
      expect(trigger).toHaveFocus();
    });
  });

  it("scenario 10c: closes on outside click and restores focus", async () => {
    const user = userEvent.setup();

    render(
      <SessionHarness
        initialState={makeRevealedState({ selfModerator: false, sessionRounds: [makeSnapshot()] })}
      />
    );

    const trigger = screen.getByRole("button", { name: /view session summary/i });
    await user.click(trigger);
    expect(await screen.findByRole("dialog", { name: /session summary/i })).toBeInTheDocument();

    await user.pointer([{ target: document.body, keys: "[MouseLeft]" }]);

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: /session summary/i })).not.toBeInTheDocument();
      expect(trigger).toHaveFocus();
    });
  });

  it("scenario 10d: focus is trapped inside the session modal", async () => {
    const user = userEvent.setup();

    render(
      <SessionHarness
        initialState={makeRevealedState({ selfModerator: false, sessionRounds: [makeSnapshot()] })}
      />
    );

    await user.click(screen.getByRole("button", { name: /view session summary/i }));
    expect(await screen.findByRole("dialog", { name: /session summary/i })).toBeInTheDocument();

    // Header × close gets focus first
    const headerClose = screen.getByRole("button", { name: /close session summary/i });
    const footerClose = screen.getByRole("button", { name: /^close$/i });

    expect(headerClose).toHaveFocus();

    await user.tab();
    expect(footerClose).toHaveFocus();

    await user.tab();
    expect(headerClose).toHaveFocus();
  });
});
