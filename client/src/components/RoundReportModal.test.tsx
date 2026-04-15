import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRef, useState } from "react";
import { describe, expect, it, vi } from "vitest";
import type { PublicParticipant, PublicRoomState } from "@yasp/shared";
import { makePublicRoomState } from "../test/roomState";
import { ResultsPanel } from "./ResultsPanel";
import { RoundReportModal, type RoundReportModalMode } from "./RoundReportModal";

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
  overrides = {},
}: {
  selfModerator?: boolean;
  overrides?: Partial<PublicRoomState>;
} = {}): PublicRoomState {
  return makePublicRoomState({
    id: "ROOM01",
    roundNumber: 4,
    revealed: true,
    participants: buildParticipants(selfModerator),
    votes: { me: "3", p2: "5" },
    stats: {
      totalVotes: 2,
      numericAverage: 4,
      distribution: { "3": 1, "5": 1 },
      consensus: false,
      mostCommon: null,
    },
    ...overrides,
  });
}

function makeHiddenState(selfModerator = true): PublicRoomState {
  return makePublicRoomState({
    id: "ROOM01",
    roundNumber: 4,
    revealed: false,
    participants: buildParticipants(selfModerator),
    votes: null,
    stats: null,
  });
}

function RoundDetailsHarness({ initialState }: { initialState: PublicRoomState }) {
  const [state, setState] = useState(initialState);
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const mode: RoundReportModalMode = state.participants.find((participant) => participant.isSelf)?.isModerator
    ? "moderator"
    : "participant";

  return (
    <>
      {state.revealed ? (
        <ResultsPanel
          state={state}
          onOpenRoundReport={() => setOpen(true)}
          roundReportButtonRef={triggerRef}
        />
      ) : (
        <div data-testid="pre-reveal-placeholder">Pre-reveal</div>
      )}

      {open && state.revealed && (
        <RoundReportModal
          open
          state={state}
          revealedAt={Date.UTC(2026, 3, 15, 14, 30)}
          mode={mode}
          onClose={() => setOpen(false)}
          returnFocusRef={triggerRef}
        />
      )}

      <button type="button" onClick={() => setState(makeHiddenState(mode === "moderator"))}>
        Reset round
      </button>
    </>
  );
}

describe("ResultsPanel round detail entry point", () => {
  it("renders the moderator trigger label after reveal", async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();

    render(<ResultsPanel state={makeRevealedState()} onOpenRoundReport={onOpen} />);

    const trigger = screen.getByRole("button", { name: /view round report/i });
    await user.click(trigger);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("renders the participant trigger label after reveal", async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();

    render(<ResultsPanel state={makeRevealedState({ selfModerator: false })} onOpenRoundReport={onOpen} />);

    const trigger = screen.getByRole("button", { name: /view round summary/i });
    await user.click(trigger);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("does not render a trigger when no handler is provided", () => {
    render(<ResultsPanel state={makeRevealedState()} />);

    expect(screen.queryByRole("button", { name: /view round report/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /view round summary/i })).not.toBeInTheDocument();
  });

  it("does not render either trigger before reveal", () => {
    render(<RoundDetailsHarness initialState={makeHiddenState()} />);

    expect(screen.queryByRole("button", { name: /view round report/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /view round summary/i })).not.toBeInTheDocument();
  });
});

describe("RoundReportModal participant mode", () => {
  it("renders a summary with stats, note, table, and distribution but no export actions", () => {
    render(
      <RoundReportModal
        open
        state={makeRevealedState({
          selfModerator: false,
          overrides: {
            votes: { me: "?", p2: "5" },
            stats: {
              totalVotes: 2,
              numericAverage: 5,
              distribution: { "?": 1, "5": 1 },
              consensus: false,
              mostCommon: null,
            },
          },
        })}
        revealedAt={Date.UTC(2026, 3, 15, 14, 30)}
        mode="participant"
        onClose={vi.fn()}
      />
    );

    const dialog = screen.getByRole("dialog", { name: /round summary/i });
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByText(/round 4/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/deck:/i)).toBeInTheDocument();
    expect(
      within(dialog).getByText(/non-numeric votes appear in the table and distribution/i)
    ).toBeInTheDocument();
    expect(within(dialog).getByRole("heading", { name: /votes/i })).toBeInTheDocument();
    expect(within(dialog).getByRole("heading", { name: /distribution/i })).toBeInTheDocument();

    const table = within(dialog).getByRole("table");
    expect(within(table).getAllByRole("row")).toHaveLength(3);
    expect(within(table).getByText("Alice")).toBeInTheDocument();
    expect(within(table).getByText("Bob")).toBeInTheDocument();

    expect(within(dialog).queryByRole("button", { name: /export csv/i })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: /export json/i })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: /print/i })).not.toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: /^close$/i })).toBeInTheDocument();
  });

  it("opens, closes on outside click, and restores focus to the summary trigger", async () => {
    const user = userEvent.setup();

    render(<RoundDetailsHarness initialState={makeRevealedState({ selfModerator: false })} />);

    const trigger = screen.getByRole("button", { name: /view round summary/i });
    await user.click(trigger);
    expect(await screen.findByRole("dialog", { name: /round summary/i })).toBeInTheDocument();

    await user.pointer([{ target: document.body, keys: "[MouseLeft]" }]);

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: /round summary/i })).not.toBeInTheDocument();
      expect(trigger).toHaveFocus();
    });
  });
});

describe("RoundReportModal moderator mode", () => {
  it("still renders export actions for moderators", () => {
    render(
      <RoundReportModal
        open
        state={makeRevealedState()}
        revealedAt={Date.UTC(2026, 3, 15, 14, 30)}
        mode="moderator"
        onClose={vi.fn()}
      />
    );

    const dialog = screen.getByRole("dialog", { name: /round report/i });
    expect(within(dialog).getByRole("button", { name: /export csv/i })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: /export json/i })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: /print/i })).toBeInTheDocument();
    expect(within(dialog).getByText(/temporary and exists only in this session/i)).toBeInTheDocument();
  });

  it("triggers a download when Export CSV is clicked", async () => {
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
      const element = originalCreateElement(tag);
      if (tag === "a") {
        (element as HTMLAnchorElement).click = anchorClick;
      }
      return element;
    });

    try {
      render(
        <RoundReportModal
          open
          state={makeRevealedState()}
          revealedAt={Date.UTC(2026, 3, 15, 14, 30)}
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

describe("RoundReportModal accessibility and lifecycle", () => {
  it.each([
    { mode: "moderator" as const, triggerLabel: /view round report/i, dialogLabel: /round report/i },
    { mode: "participant" as const, triggerLabel: /view round summary/i, dialogLabel: /round summary/i },
  ])("closes on Escape and restores focus in $mode mode", async ({ dialogLabel, mode, triggerLabel }) => {
    const user = userEvent.setup();

    render(
      <RoundDetailsHarness
        initialState={makeRevealedState({
          selfModerator: mode === "moderator",
        })}
      />
    );

    const trigger = screen.getByRole("button", { name: triggerLabel });
    await user.click(trigger);
    expect(await screen.findByRole("dialog", { name: dialogLabel })).toBeInTheDocument();

    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: dialogLabel })).not.toBeInTheDocument();
      expect(trigger).toHaveFocus();
    });
  });

  it("keeps focus trapped inside the participant summary dialog", async () => {
    const user = userEvent.setup();

    render(<RoundDetailsHarness initialState={makeRevealedState({ selfModerator: false })} />);

    await user.click(screen.getByRole("button", { name: /view round summary/i }));
    expect(await screen.findByRole("dialog", { name: /round summary/i })).toBeInTheDocument();

    const closeButtons = screen.getAllByRole("button", { name: /close/i });
    const headerCloseButton = closeButtons[0];
    const footerCloseButton = closeButtons[1];

    expect(headerCloseButton).toHaveFocus();

    await user.tab();
    expect(footerCloseButton).toHaveFocus();

    await user.tab();
    expect(headerCloseButton).toHaveFocus();
  });

  it("closes the modal and removes trigger availability when the round resets", async () => {
    const user = userEvent.setup();

    render(<RoundDetailsHarness initialState={makeRevealedState({ selfModerator: false })} />);

    await user.click(screen.getByRole("button", { name: /view round summary/i }));
    expect(await screen.findByRole("dialog", { name: /round summary/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /reset round/i }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: /round summary/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /view round summary/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /view round report/i })).not.toBeInTheDocument();
    });
  });
});
