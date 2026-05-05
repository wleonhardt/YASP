import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TopBar } from "./TopBar";
import { makePublicRoomState } from "../test/roomState";

describe("TopBar", () => {
  it("opens moderator controls from a moderator-only drawer trigger", async () => {
    const user = userEvent.setup();

    render(
      <TopBar
        state={makePublicRoomState()}
        connectionStatus="connected"
        compatibilityMode={false}
        onLeave={vi.fn()}
        onCopyFeedback={vi.fn()}
        moderatorControls={<div>Timer settings live here</div>}
      />
    );

    const trigger = screen.getByRole("button", { name: /moderator controls/i });
    await user.click(trigger);

    const dialog = screen.getByRole("dialog", { name: /moderator controls/i });
    expect(within(dialog).getByText("Timer settings live here")).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: /close/i }));

    expect(screen.queryByRole("dialog", { name: /moderator controls/i })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("does not show the moderator drawer trigger to non-moderators", () => {
    render(
      <TopBar
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
        connectionStatus="connected"
        compatibilityMode={false}
        onLeave={vi.fn()}
        onCopyFeedback={vi.fn()}
        moderatorControls={<div>Timer settings live here</div>}
      />
    );

    expect(screen.queryByRole("button", { name: /moderator controls/i })).not.toBeInTheDocument();
  });

  it("renders the room code without a copy action when sharing is owned elsewhere", () => {
    render(
      <TopBar
        state={makePublicRoomState()}
        connectionStatus="connected"
        compatibilityMode={false}
        onLeave={vi.fn()}
        onCopyFeedback={vi.fn()}
        roomCodeCopyEnabled={false}
        moderatorControls={<div>Timer settings live here</div>}
      />
    );

    expect(screen.getByText("ROOM01")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /copy link/i })).not.toBeInTheDocument();
  });
});
