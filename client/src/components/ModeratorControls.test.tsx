import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { PublicRoomState } from "@yasp/shared";
import { ModeratorControls } from "./ModeratorControls";
import { makePublicRoomState } from "../test/roomState";
import * as storage from "../lib/storage";

function makeState(overrides: Partial<PublicRoomState> = {}): PublicRoomState {
  return makePublicRoomState({
    participants: [
      {
        id: "me",
        name: "Alice",
        role: "voter",
        connected: true,
        hasVoted: false,
        isSelf: true,
        isModerator: true,
      },
      {
        id: "p2",
        name: "Bob",
        role: "voter",
        connected: true,
        hasVoted: false,
        isSelf: false,
        isModerator: false,
      },
    ],
    ...overrides,
  });
}

function handlers() {
  return {
    onSetTimerDuration: vi.fn(),
    onStartTimer: vi.fn().mockResolvedValue(true),
    onPauseTimer: vi.fn(),
    onResetTimer: vi.fn(),
    onHonkTimer: vi.fn().mockResolvedValue(true),
    onReveal: vi.fn(),
    onReset: vi.fn(),
    onNextRound: vi.fn(),
    onTransferModerator: vi.fn().mockResolvedValue(true),
  };
}

describe("ModeratorControls", () => {
  it("renders pacing controls with inline round actions on desktop", async () => {
    const user = userEvent.setup();

    render(<ModeratorControls compact={false} state={makeState()} {...handlers()} />);

    const panel = screen.getByRole("region", { name: /moderator controls/i });
    const scope = within(panel);

    expect(scope.getByRole("heading", { name: "00:10" })).toBeInTheDocument();
    expect(scope.getByRole("button", { name: /start/i })).toBeInTheDocument();
    expect(scope.getByRole("button", { name: /sound on/i })).toBeInTheDocument();
    expect(scope.queryByRole("button", { name: /timer & pacing/i })).not.toBeInTheDocument();
    expect(scope.getByRole("button", { name: /reveal votes/i })).toBeInTheDocument();
    expect(scope.getByRole("button", { name: /^transfer$/i })).toBeInTheDocument();
    expect(panel.querySelectorAll(".controls-panel__status-rail .ui-chip")).toHaveLength(2);

    await user.click(scope.getByRole("button", { name: /^transfer$/i }));

    const transferGroup = scope.getByRole("group", { name: /transfer/i });
    expect(transferGroup).toBeInTheDocument();
    expect(within(transferGroup).getByRole("combobox", { name: /new moderator/i })).toBeInTheDocument();
  });

  it("collapses timer controls by default on compact screens and expands them on demand", async () => {
    const user = userEvent.setup();

    const props = handlers();
    const { rerender } = render(<ModeratorControls compact state={makeState()} {...props} />);

    const panel = screen.getByRole("region", { name: /moderator controls/i });
    const scope = within(panel);
    const timerToggle = scope.getByRole("button", { name: /timer & pacing/i });

    expect(timerToggle).toHaveAttribute("aria-expanded", "false");
    expect(panel.querySelector(".controls-panel__status-rail")).not.toBeInTheDocument();
    expect(panel.querySelectorAll(".controls-panel__status-row .ui-chip")).toHaveLength(1);
    expect(scope.queryByRole("button", { name: /start/i })).not.toBeInTheDocument();
    expect(scope.getByRole("button", { name: /reveal votes/i })).toBeInTheDocument();
    expect(scope.getByText(/duration 10s • sound on/i)).toBeInTheDocument();

    await user.click(timerToggle);

    expect(timerToggle).toHaveAttribute("aria-expanded", "true");
    expect(scope.getByRole("button", { name: /start/i })).toBeInTheDocument();
    expect(scope.getByRole("button", { name: /sound on/i })).toBeInTheDocument();

    rerender(
      <ModeratorControls
        compact
        state={makeState({
          timer: {
            durationSeconds: 60,
            remainingSeconds: 42,
            running: true,
            endsAt: Date.now() + 42_000,
            completedAt: null,
            lastHonkAt: null,
            honkAvailableAt: null,
          },
        })}
        {...props}
      />
    );

    expect(scope.getByRole("button", { name: /timer & pacing/i })).toHaveAttribute("aria-expanded", "true");
    expect(scope.getByRole("button", { name: /pause/i })).toBeInTheDocument();
  });

  it("stays stable when a running timer completes during honk cooldown on compact screens", async () => {
    const user = userEvent.setup();
    const props = handlers();
    const cooldownUntil = Date.now() + 4_000;
    const { rerender } = render(<ModeratorControls compact state={makeState()} {...props} />);

    const panel = screen.getByRole("region", { name: /moderator controls/i });
    const scope = within(panel);
    const timerToggle = scope.getByRole("button", { name: /timer & pacing/i });

    await user.click(timerToggle);
    expect(timerToggle).toHaveAttribute("aria-expanded", "true");

    rerender(
      <ModeratorControls
        compact
        state={makeState({
          timer: {
            durationSeconds: 10,
            remainingSeconds: 9,
            running: true,
            endsAt: Date.now() + 9_000,
            completedAt: null,
            lastHonkAt: Date.now(),
            honkAvailableAt: cooldownUntil,
          },
        })}
        {...props}
      />
    );

    expect(scope.getByRole("button", { name: /pause/i })).toBeInTheDocument();

    rerender(
      <ModeratorControls
        compact
        state={makeState({
          revealed: true,
          timer: {
            durationSeconds: 10,
            remainingSeconds: 0,
            running: false,
            endsAt: null,
            completedAt: Date.now(),
            lastHonkAt: Date.now(),
            honkAvailableAt: cooldownUntil,
          },
        })}
        {...props}
      />
    );

    expect(scope.getByRole("button", { name: /timer & pacing/i })).toHaveAttribute("aria-expanded", "true");
    expect(scope.getByRole("button", { name: /next round/i })).toBeInTheDocument();
    expect(scope.getByRole("heading", { name: "00:00" })).toBeInTheDocument();
    expect(scope.getByRole("button", { name: /beep/i })).toBeDisabled();
  });

  it("shows sound off in the compact drawer summary when the stored preference is off", () => {
    vi.spyOn(storage, "getStoredTimerSoundEnabled").mockReturnValue(false);

    render(<ModeratorControls compact state={makeState()} {...handlers()} />);

    const panel = screen.getByRole("region", { name: /moderator controls/i });
    const scope = within(panel);

    expect(scope.getByText(/duration 10s • sound off/i)).toBeInTheDocument();
  });

  it("shows next round and reset inline on desktop after reveal", () => {
    render(<ModeratorControls compact={false} state={makeState({ revealed: true })} {...handlers()} />);

    const panel = screen.getByRole("region", { name: /moderator controls/i });
    const scope = within(panel);
    const roundActions = panel.querySelector(".room-timer__action-group--round");

    expect(roundActions).not.toBeNull();
    const roundScope = within(roundActions as HTMLElement);

    expect(scope.getByRole("button", { name: /next round/i })).toBeInTheDocument();
    expect(roundScope.getByRole("button", { name: /reset round/i })).toBeInTheDocument();
  });

  it("hides transfer controls when the moderator is alone", () => {
    render(
      <ModeratorControls
        compact={false}
        state={makePublicRoomState({
          participants: [
            {
              id: "me",
              name: "Alice",
              role: "voter",
              connected: true,
              hasVoted: false,
              isSelf: true,
              isModerator: true,
            },
          ],
        })}
        {...handlers()}
      />
    );

    const panel = screen.getByRole("region", { name: /moderator controls/i });
    expect(within(panel).queryByRole("button", { name: /^transfer$/i })).not.toBeInTheDocument();
  });
});
