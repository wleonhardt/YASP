import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TopBar } from "./TopBar";
import { makePublicRoomState } from "../test/roomState";

describe("TopBar", () => {
  it("opens moderator controls from the utility menu for moderators", async () => {
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

    expect(screen.queryByRole("button", { name: /moderator controls/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /open session preferences/i }));

    const preferencesDialog = screen.getByRole("dialog", { name: /session preferences/i });
    const trigger = within(preferencesDialog).getByRole("button", { name: /moderator controls/i });
    const icon = trigger.querySelector(".moderator-drawer__trigger-icon");
    expect(icon?.querySelectorAll("line")).toHaveLength(9);
    expect(icon?.querySelector("circle")).toBeNull();

    await user.click(trigger);

    const dialog = screen.getByRole("dialog", { name: /moderator controls/i });
    expect(within(dialog).getByText("Timer settings live here")).toBeInTheDocument();

    const closeButton = within(dialog).getByRole("button", { name: /close/i });
    expect(closeButton).toHaveTextContent("");
    expect(closeButton.querySelector("svg[aria-hidden='true']")).toBeInTheDocument();
    expect(closeButton.querySelectorAll("line")).toHaveLength(2);

    await user.click(closeButton);

    expect(screen.queryByRole("dialog", { name: /moderator controls/i })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("does not show moderator controls in the utility menu for non-moderators", async () => {
    const user = userEvent.setup();

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

    await user.click(screen.getByRole("button", { name: /open session preferences/i }));

    const preferencesDialog = screen.getByRole("dialog", { name: /session preferences/i });
    expect(
      within(preferencesDialog).queryByRole("button", { name: /moderator controls/i })
    ).not.toBeInTheDocument();
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
    expect(screen.queryByText("Room")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /copy link/i })).not.toBeInTheDocument();
  });
});
