import { describe, expect, it } from "vitest";
import type { PublicParticipant } from "@yasp/shared";
import { makePublicRoomState } from "../test/roomState";
import { shouldShowInviteHero } from "./room";

function participant(overrides: Partial<PublicParticipant>): PublicParticipant {
  return {
    id: "participant",
    name: "Participant",
    role: "voter",
    connected: true,
    hasVoted: false,
    isSelf: false,
    isModerator: false,
    ...overrides,
  };
}

describe("shouldShowInviteHero", () => {
  it("shows the invite hero when only the moderator is a connected voter", () => {
    expect(
      shouldShowInviteHero(
        makePublicRoomState({
          participants: [
            participant({
              id: "me",
              name: "Alice",
              isSelf: true,
              isModerator: true,
            }),
          ],
        })
      )
    ).toBe(true);
  });

  it("keeps showing the invite hero when only spectators join", () => {
    expect(
      shouldShowInviteHero(
        makePublicRoomState({
          participants: [
            participant({
              id: "me",
              name: "Alice",
              isSelf: true,
              isModerator: true,
            }),
            participant({
              id: "spectator",
              name: "Sam",
              role: "spectator",
            }),
          ],
        })
      )
    ).toBe(true);
  });

  it("hides the invite hero once a connected non-moderator voter is present", () => {
    expect(
      shouldShowInviteHero(
        makePublicRoomState({
          participants: [
            participant({
              id: "me",
              name: "Alice",
              isSelf: true,
              isModerator: true,
            }),
            participant({
              id: "bob",
              name: "Bob",
            }),
          ],
        })
      )
    ).toBe(false);
  });

  it("ignores disconnected non-moderator voters", () => {
    expect(
      shouldShowInviteHero(
        makePublicRoomState({
          participants: [
            participant({
              id: "me",
              name: "Alice",
              isSelf: true,
              isModerator: true,
            }),
            participant({
              id: "bob",
              name: "Bob",
              connected: false,
            }),
          ],
        })
      )
    ).toBe(true);
  });
});
