import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { makePublicRoomState } from "../test/roomState";
import { StoryAgenda } from "./StoryAgenda";

function handlers() {
  return {
    onUpdateStoryLabel: vi.fn().mockResolvedValue(true),
    onAddStoryAgendaItems: vi.fn().mockResolvedValue(true),
    onRemoveStoryAgendaItem: vi.fn().mockResolvedValue(true),
    onMoveStoryAgendaItem: vi.fn().mockResolvedValue(true),
    onStartNextStory: vi.fn().mockResolvedValue(true),
  };
}

describe("StoryAgenda", () => {
  it("lets moderators edit the current story and start the next queued story", async () => {
    const user = userEvent.setup();
    const props = handlers();

    render(
      <StoryAgenda
        state={makePublicRoomState({
          currentStoryLabel: "Checkout total",
          storyQueue: [{ id: "story-1", label: "Discount code" }],
        })}
        {...props}
      />
    );

    const input = screen.getByRole("textbox", { name: /current story label/i });
    await user.clear(input);
    await user.type(input, "Guest checkout");
    await user.click(screen.getByRole("button", { name: /save/i }));
    await user.click(screen.getByRole("button", { name: /start next story/i }));

    expect(props.onUpdateStoryLabel).toHaveBeenCalledWith("Guest checkout");
    expect(props.onStartNextStory).toHaveBeenCalledTimes(1);
  });

  it("supports adding, bulk-adding, reordering, and removing queued stories", async () => {
    const user = userEvent.setup();
    const props = handlers();

    render(
      <StoryAgenda
        state={makePublicRoomState({
          storyQueue: [
            { id: "story-1", label: "Checkout total" },
            { id: "story-2", label: "Discount code" },
          ],
        })}
        {...props}
      />
    );

    await user.click(screen.getByText(/agenda/i));
    await user.type(screen.getByRole("textbox", { name: /add story/i }), "Guest checkout");
    await user.click(screen.getByRole("button", { name: /^add$/i }));
    await user.type(screen.getByRole("textbox", { name: /bulk add/i }), "Profile page\nSearch");
    await user.click(screen.getByRole("button", { name: /add lines/i }));
    await user.click(screen.getByRole("button", { name: /move discount code up/i }));
    await user.click(screen.getByRole("button", { name: /remove checkout total/i }));

    expect(props.onAddStoryAgendaItems).toHaveBeenNthCalledWith(1, ["Guest checkout"]);
    expect(props.onAddStoryAgendaItems).toHaveBeenNthCalledWith(2, ["Profile page", "Search"]);
    expect(props.onMoveStoryAgendaItem).toHaveBeenCalledWith("story-2", "up");
    expect(props.onRemoveStoryAgendaItem).toHaveBeenCalledWith("story-1");
  });

  it("shows read-only current story and queue to non-moderators", async () => {
    const user = userEvent.setup();
    const props = handlers();

    render(
      <StoryAgenda
        state={makePublicRoomState({
          currentStoryLabel: "Checkout total",
          storyQueue: [{ id: "story-1", label: "Discount code" }],
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
        {...props}
      />
    );

    expect(screen.getByText("Checkout total")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: /current story label/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /start next story/i })).not.toBeInTheDocument();

    await user.click(screen.getByText(/agenda/i));
    const list = screen.getByRole("list");
    expect(within(list).getByText("Discount code")).toBeInTheDocument();
    expect(props.onAddStoryAgendaItems).not.toHaveBeenCalled();
  });
});
