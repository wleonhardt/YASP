import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRef, useState } from "react";
import { describe, expect, it, vi } from "vitest";
import type { PublicRoomState } from "@yasp/shared";
import { makePublicRoomState } from "../test/roomState";
import { ResultsPanel } from "./ResultsPanel";
import { RoundReportModal } from "./RoundReportModal";

function makeRevealedState(overrides: Partial<PublicRoomState> = {}): PublicRoomState {
  return makePublicRoomState({
    id: "ROOM01",
    roundNumber: 4,
    revealed: true,
    participants: [
      {
        id: "me",
        name: "Alice",
        role: "voter",
        connected: true,
        hasVoted: true,
        isSelf: true,
        isModerator: true,
      },
      {
        id: "p2",
        name: "Bob",
        role: "voter",
        connected: true,
        hasVoted: true,
        isSelf: false,
        isModerator: false,
      },
    ],
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

describe("ResultsPanel round report entry point", () => {
  it("does not render the entry point for non-moderators", () => {
    const state = makeRevealedState({
      participants: [
        {
          id: "me",
          name: "Alice",
          role: "voter",
          connected: true,
          hasVoted: true,
          isSelf: true,
          isModerator: false,
        },
        {
          id: "p2",
          name: "Bob",
          role: "voter",
          connected: true,
          hasVoted: true,
          isSelf: false,
          isModerator: true,
        },
      ],
    });
    render(<ResultsPanel state={state} onOpenRoundReport={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /view round report/i })).not.toBeInTheDocument();
  });

  it("does not render the entry point when no handler is provided", () => {
    render(<ResultsPanel state={makeRevealedState()} />);
    expect(screen.queryByRole("button", { name: /view round report/i })).not.toBeInTheDocument();
  });

  it("renders a moderator-only entry point when revealed", async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    render(<ResultsPanel state={makeRevealedState()} onOpenRoundReport={onOpen} />);
    const trigger = screen.getByRole("button", { name: /view round report/i });
    await user.click(trigger);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});

describe("RoundReportModal", () => {
  it("renders title, stats, and the votes table", () => {
    render(
      <RoundReportModal
        open
        state={makeRevealedState()}
        revealedAt={Date.UTC(2026, 3, 15, 14, 30)}
        onClose={vi.fn()}
      />
    );

    const dialog = screen.getByRole("dialog", { name: /round report/i });
    expect(dialog).toBeInTheDocument();

    const table = within(dialog).getByRole("table");
    const rows = within(table).getAllByRole("row");
    // header + 2 voters
    expect(rows).toHaveLength(3);
    expect(within(table).getByText("Alice")).toBeInTheDocument();
    expect(within(table).getByText("Bob")).toBeInTheDocument();
  });

  it("closes on Escape and restores focus to the trigger", async () => {
    const user = userEvent.setup();

    function Harness() {
      const [open, setOpen] = useState(false);
      const triggerRef = useRef<HTMLButtonElement | null>(null);
      return (
        <>
          <button ref={triggerRef} type="button" onClick={() => setOpen(true)}>
            Open round report
          </button>
          <RoundReportModal
            open={open}
            state={makeRevealedState()}
            revealedAt={Date.UTC(2026, 3, 15, 14, 30)}
            onClose={() => setOpen(false)}
            returnFocusRef={triggerRef}
          />
        </>
      );
    }

    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "Open round report" });
    await user.click(trigger);
    expect(await screen.findByRole("dialog", { name: /round report/i })).toBeInTheDocument();

    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: /round report/i })).not.toBeInTheDocument();
      expect(trigger).toHaveFocus();
    });
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
