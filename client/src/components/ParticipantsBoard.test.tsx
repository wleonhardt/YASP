import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ParticipantsBoard } from "./ParticipantsBoard";
import { makePublicRoomState } from "../test/roomState";

describe("ParticipantsBoard", () => {
  it("keeps the unvoted participant prominent in the compact rail", () => {
    render(
      <ParticipantsBoard
        variant="rail"
        state={makePublicRoomState({
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
              id: "bob",
              name: "Bob",
              role: "voter",
              connected: true,
              hasVoted: false,
              isSelf: false,
              isModerator: false,
            },
            {
              id: "cam",
              name: "Cam",
              role: "voter",
              connected: true,
              hasVoted: true,
              isSelf: false,
              isModerator: false,
            },
            {
              id: "dee",
              name: "Dee",
              role: "voter",
              connected: true,
              hasVoted: true,
              isSelf: false,
              isModerator: false,
            },
          ],
        })}
      />
    );

    const bobRow = screen.getByText("Bob").closest(".participant-card");
    expect(bobRow).not.toBeNull();
    const row = bobRow as HTMLElement;

    expect(row).toHaveClass("participant-card--rail", "participant-card--waiting");
    expect(within(row).getByText("Not voted")).toBeInTheDocument();
    expect(row.querySelector(".participant-card__vote")).not.toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: /vote progress/i })).toHaveAttribute("aria-valuenow", "3");
  });
});
