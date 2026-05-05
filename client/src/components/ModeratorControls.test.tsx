import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
    onUpdateSettings: vi.fn().mockResolvedValue(true),
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

function mockTimerSound(enabled: boolean) {
  vi.spyOn(storage, "getStoredTimerSoundEnabled").mockReturnValue(enabled);
}

beforeEach(() => {
  mockTimerSound(true);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ModeratorControls", () => {
  it("renders pacing controls without inline round actions on desktop", async () => {
    const user = userEvent.setup();

    render(<ModeratorControls compact={false} state={makeState()} {...handlers()} />);

    const panel = screen.getByRole("region", { name: /moderator controls/i });
    const scope = within(panel);

    expect(scope.getByRole("heading", { name: "01:00" })).toBeInTheDocument();
    expect(scope.getByRole("button", { name: /start/i })).toBeInTheDocument();
    expect(scope.queryByRole("button", { name: /sound on/i })).not.toBeInTheDocument();
    expect(scope.getByTitle(/sound on/i)).toBeInTheDocument();
    expect(scope.queryByRole("button", { name: /timer & pacing/i })).not.toBeInTheDocument();
    expect(scope.queryByRole("button", { name: /^reveal votes$/i })).not.toBeInTheDocument();
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
    expect(scope.queryByRole("button", { name: /^reveal votes$/i })).not.toBeInTheDocument();
    expect(scope.getByText(/duration 1m • sound on/i)).toBeInTheDocument();

    await user.click(timerToggle);

    expect(timerToggle).toHaveAttribute("aria-expanded", "true");
    expect(scope.getByRole("button", { name: /start/i })).toBeInTheDocument();
    expect(scope.queryByRole("button", { name: /sound on/i })).not.toBeInTheDocument();
    expect(scope.getByTitle(/sound on/i)).toBeInTheDocument();

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
    expect(scope.queryByRole("button", { name: /next round/i })).not.toBeInTheDocument();
    expect(scope.getByRole("heading", { name: "00:00" })).toBeInTheDocument();
    expect(scope.getByRole("button", { name: /beep/i })).toBeDisabled();
  });

  it("shows sound off in the compact drawer summary when the stored preference is off", () => {
    mockTimerSound(false);

    render(<ModeratorControls compact state={makeState()} {...handlers()} />);

    const panel = screen.getByRole("region", { name: /moderator controls/i });
    const scope = within(panel);

    expect(scope.getByText(/duration 1m • sound off/i)).toBeInTheDocument();
  });

  it("keeps round reset and next actions out of moderator controls after reveal", () => {
    render(<ModeratorControls compact={false} state={makeState({ revealed: true })} {...handlers()} />);

    const panel = screen.getByRole("region", { name: /moderator controls/i });
    const scope = within(panel);

    expect(scope.queryByRole("button", { name: /next round/i })).not.toBeInTheDocument();
    expect(scope.queryByRole("button", { name: /reset round/i })).not.toBeInTheDocument();
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

  it("shows room settings for moderators and renders values from room state", async () => {
    const user = userEvent.setup();

    render(
      <ModeratorControls
        compact={false}
        state={makeState({
          settings: {
            revealPolicy: "anyone",
            resetPolicy: "moderator_only",
            deckChangePolicy: "anyone",
            allowNameChange: false,
            allowSelfRoleSwitch: true,
            allowSpectators: false,
            autoReveal: false,
            autoRevealDelayMs: 1500,
          },
        })}
        {...handlers()}
      />
    );

    const panel = screen.getByRole("region", { name: /moderator controls/i });
    const scope = within(panel);

    await user.click(scope.getByRole("button", { name: /room settings/i }));

    expect(scope.getByRole("combobox", { name: /reveal votes/i })).toHaveValue("anyone");
    expect(scope.getByRole("combobox", { name: /reset round/i })).toHaveValue("moderator_only");
    expect(scope.getByRole("combobox", { name: /deck changes/i })).toHaveValue("anyone");
    expect(scope.getByRole("checkbox", { name: /allow name changes/i })).not.toBeChecked();
    expect(scope.getByRole("checkbox", { name: /allow role switching/i })).toBeChecked();
    expect(scope.getByRole("checkbox", { name: /allow spectators/i })).not.toBeChecked();
  });

  it("hides room settings from non-moderators", () => {
    render(
      <ModeratorControls
        compact={false}
        state={makeState({
          participants: [
            {
              id: "me",
              name: "Alice",
              role: "voter",
              connected: true,
              hasVoted: false,
              isSelf: true,
              isModerator: false,
            },
            {
              id: "p2",
              name: "Bob",
              role: "voter",
              connected: true,
              hasVoted: false,
              isSelf: false,
              isModerator: true,
            },
          ],
        })}
        {...handlers()}
      />
    );

    expect(screen.queryByRole("button", { name: /room settings/i })).not.toBeInTheDocument();
  });

  it("sends updated room settings when a moderator changes a control", async () => {
    const user = userEvent.setup();
    const props = handlers();

    render(<ModeratorControls compact={false} state={makeState()} {...props} />);

    const panel = screen.getByRole("region", { name: /moderator controls/i });
    const scope = within(panel);

    await user.click(scope.getByRole("button", { name: /room settings/i }));
    await user.selectOptions(scope.getByRole("combobox", { name: /reveal votes/i }), "anyone");
    await user.click(scope.getByRole("checkbox", { name: /allow spectators/i }));

    expect(props.onUpdateSettings).toHaveBeenNthCalledWith(1, { revealPolicy: "anyone" });
    expect(props.onUpdateSettings).toHaveBeenNthCalledWith(2, { allowSpectators: false });
  });

  it("sends the expected payload for every exposed room setting control", async () => {
    const user = userEvent.setup();
    const props = handlers();

    render(<ModeratorControls compact={false} state={makeState()} {...props} />);

    const panel = screen.getByRole("region", { name: /moderator controls/i });
    const scope = within(panel);

    await user.click(scope.getByRole("button", { name: /room settings/i }));
    await user.selectOptions(scope.getByRole("combobox", { name: /reveal votes/i }), "anyone");
    await user.selectOptions(scope.getByRole("combobox", { name: /reset round/i }), "anyone");
    await user.selectOptions(scope.getByRole("combobox", { name: /deck changes/i }), "anyone");
    await user.click(scope.getByRole("checkbox", { name: /allow name changes/i }));
    await user.click(scope.getByRole("checkbox", { name: /allow role switching/i }));
    await user.click(scope.getByRole("checkbox", { name: /allow spectators/i }));

    expect(props.onUpdateSettings).toHaveBeenNthCalledWith(1, { revealPolicy: "anyone" });
    expect(props.onUpdateSettings).toHaveBeenNthCalledWith(2, { resetPolicy: "anyone" });
    expect(props.onUpdateSettings).toHaveBeenNthCalledWith(3, { deckChangePolicy: "anyone" });
    expect(props.onUpdateSettings).toHaveBeenNthCalledWith(4, { allowNameChange: false });
    expect(props.onUpdateSettings).toHaveBeenNthCalledWith(5, { allowSelfRoleSwitch: false });
    expect(props.onUpdateSettings).toHaveBeenNthCalledWith(6, { allowSpectators: false });
  });

  it("reflects the latest room snapshot values when settings change", async () => {
    const user = userEvent.setup();
    const props = handlers();
    const { rerender } = render(<ModeratorControls compact={false} state={makeState()} {...props} />);

    const panel = screen.getByRole("region", { name: /moderator controls/i });
    const scope = within(panel);

    await user.click(scope.getByRole("button", { name: /room settings/i }));

    expect(scope.getByRole("combobox", { name: /reveal votes/i })).toHaveValue("moderator_only");
    expect(scope.getByRole("combobox", { name: /reset round/i })).toHaveValue("moderator_only");
    expect(scope.getByRole("combobox", { name: /deck changes/i })).toHaveValue("moderator_only");
    expect(scope.getByRole("checkbox", { name: /allow name changes/i })).toBeChecked();
    expect(scope.getByRole("checkbox", { name: /allow role switching/i })).toBeChecked();
    expect(scope.getByRole("checkbox", { name: /allow spectators/i })).toBeChecked();

    rerender(
      <ModeratorControls
        compact={false}
        state={makeState({
          settings: {
            revealPolicy: "anyone",
            resetPolicy: "anyone",
            deckChangePolicy: "anyone",
            allowNameChange: false,
            allowSelfRoleSwitch: false,
            allowSpectators: false,
            autoReveal: false,
            autoRevealDelayMs: 1500,
          },
        })}
        {...props}
      />
    );

    expect(scope.getByRole("combobox", { name: /reveal votes/i })).toHaveValue("anyone");
    expect(scope.getByRole("combobox", { name: /reset round/i })).toHaveValue("anyone");
    expect(scope.getByRole("combobox", { name: /deck changes/i })).toHaveValue("anyone");
    expect(scope.getByRole("checkbox", { name: /allow name changes/i })).not.toBeChecked();
    expect(scope.getByRole("checkbox", { name: /allow role switching/i })).not.toBeChecked();
    expect(scope.getByRole("checkbox", { name: /allow spectators/i })).not.toBeChecked();
  });

  it("does not expose auto reveal controls in the v1 settings panel", async () => {
    const user = userEvent.setup();

    render(<ModeratorControls compact={false} state={makeState()} {...handlers()} />);

    const panel = screen.getByRole("region", { name: /moderator controls/i });
    const scope = within(panel);

    await user.click(scope.getByRole("button", { name: /room settings/i }));

    expect(scope.queryByText(/auto reveal/i)).not.toBeInTheDocument();
    expect(scope.queryByText(/auto reveal delay/i)).not.toBeInTheDocument();
  });

  it("opens and closes room settings from the keyboard", async () => {
    const user = userEvent.setup();

    render(<ModeratorControls compact={false} state={makeState()} {...handlers()} />);

    const trigger = screen.getByRole("button", { name: /room settings/i });
    trigger.focus();
    expect(trigger).toHaveFocus();

    await user.keyboard("{Enter}");

    const revealPolicy = screen.getByRole("combobox", { name: /reveal votes/i });
    expect(revealPolicy).toHaveFocus();

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("combobox", { name: /reveal votes/i })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("supports keyboard tab navigation through the settings controls", async () => {
    const user = userEvent.setup();

    render(<ModeratorControls compact={false} state={makeState()} {...handlers()} />);

    const trigger = screen.getByRole("button", { name: /room settings/i });
    trigger.focus();

    await user.keyboard("{Enter}");

    const revealPolicy = screen.getByRole("combobox", { name: /reveal votes/i });
    const resetPolicy = screen.getByRole("combobox", { name: /reset round/i });
    const deckChangePolicy = screen.getByRole("combobox", { name: /deck changes/i });
    const allowNameChange = screen.getByRole("checkbox", { name: /allow name changes/i });
    const allowRoleSwitch = screen.getByRole("checkbox", { name: /allow role switching/i });
    const allowSpectators = screen.getByRole("checkbox", { name: /allow spectators/i });

    expect(revealPolicy).toHaveFocus();

    await user.tab();
    expect(resetPolicy).toHaveFocus();

    await user.tab();
    expect(deckChangePolicy).toHaveFocus();

    await user.tab();
    expect(allowNameChange).toHaveFocus();

    await user.tab();
    expect(allowRoleSwitch).toHaveFocus();

    await user.tab();
    expect(allowSpectators).toHaveFocus();
  });
});
