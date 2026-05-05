import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { RoundActionBar } from "./RoundActionBar";
import { makePublicRoomState } from "../test/roomState";

function handlers() {
  return {
    onReveal: vi.fn(),
    onReset: vi.fn(),
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
  });

  it("renders Next round as the primary revealed action with Reset as secondary", async () => {
    const user = userEvent.setup();
    const props = handlers();

    render(<RoundActionBar state={makePublicRoomState({ revealed: true })} {...props} />);

    await user.click(screen.getByRole("button", { name: /next round/i }));
    await user.click(screen.getByRole("button", { name: /reset round/i }));

    expect(props.onNextRound).toHaveBeenCalledTimes(1);
    expect(props.onReset).toHaveBeenCalledTimes(1);
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
});
