import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { RoundActionBar } from "./RoundActionBar";
import { makePublicRoomState } from "../test/roomState";

function handlers() {
  return {
    onReveal: vi.fn(),
    onReopenVoting: vi.fn(),
    onNextRound: vi.fn(),
  };
}

describe("RoundActionBar", () => {
  it("renders Reveal votes as the single primary voting action", async () => {
    const user = userEvent.setup();
    const props = handlers();

    render(<RoundActionBar state={makePublicRoomState()} {...props} />);

    await user.click(screen.getByRole("button", { name: /reveal votes/i }));

    expect(props.onReveal).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: /next round/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /reset round/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/next step/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^voting$/i)).not.toBeInTheDocument();
  });

  it("shows moderator-only timer shortcuts alongside Reveal votes", async () => {
    const user = userEvent.setup();
    const props = handlers();
    const onStartTimer = vi.fn().mockResolvedValue(true);
    const onHonkTimer = vi.fn().mockResolvedValue(true);

    render(
      <RoundActionBar
        state={makePublicRoomState()}
        {...props}
        onStartTimer={onStartTimer}
        onHonkTimer={onHonkTimer}
      />
    );

    await user.click(screen.getByRole("button", { name: /^start$/i }));
    await user.click(screen.getByRole("button", { name: /beep/i }));

    expect(onStartTimer).toHaveBeenCalledTimes(1);
    expect(onHonkTimer).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: /reveal votes/i })).toBeInTheDocument();
  });

  it("hides timer shortcuts from non-moderators", () => {
    render(
      <RoundActionBar
        state={makePublicRoomState({
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
          ],
        })}
        {...handlers()}
        onStartTimer={vi.fn()}
        onHonkTimer={vi.fn()}
      />
    );

    expect(screen.queryByRole("button", { name: /^start$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /beep/i })).not.toBeInTheDocument();
  });

  it("disables timer shortcuts when the timer state prevents the action", () => {
    render(
      <RoundActionBar
        state={makePublicRoomState({
          timer: {
            durationSeconds: 60,
            remainingSeconds: 42,
            running: true,
            endsAt: Date.now() + 42_000,
            completedAt: null,
            lastHonkAt: Date.now(),
            honkAvailableAt: Date.now() + 4_000,
          },
        })}
        {...handlers()}
        onStartTimer={vi.fn()}
        onHonkTimer={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: /^start$/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /beep/i })).toBeDisabled();
  });

  it("renders Next round as the primary revealed action with Re-open as a text action", async () => {
    const user = userEvent.setup();
    const props = handlers();

    render(<RoundActionBar state={makePublicRoomState({ revealed: true })} {...props} />);

    await user.click(screen.getByRole("button", { name: /next round/i }));
    await user.click(screen.getByRole("button", { name: /re-open voting/i }));

    expect(props.onNextRound).toHaveBeenCalledTimes(1);
    expect(props.onReopenVoting).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: /reset round/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/next step/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^revealed$/i)).not.toBeInTheDocument();
  });

  it("disables moderator-only reveal for non-moderators and explains why", () => {
    render(
      <RoundActionBar
        state={makePublicRoomState({
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
          ],
        })}
        {...handlers()}
      />
    );

    expect(screen.getByRole("button", { name: /reveal votes/i })).toBeDisabled();
    expect(screen.getByText(/only the moderator can reveal/i)).toBeInTheDocument();
  });

  it("disables moderator-only revealed actions for non-moderators and explains why", () => {
    render(
      <RoundActionBar
        state={makePublicRoomState({
          revealed: true,
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
          ],
        })}
        {...handlers()}
      />
    );

    expect(screen.getByRole("button", { name: /next round/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /re-open voting/i })).toBeDisabled();
    expect(screen.queryByRole("button", { name: /reset round/i })).not.toBeInTheDocument();
    expect(screen.getByText(/advance or re-open/i)).toBeInTheDocument();
  });
});
