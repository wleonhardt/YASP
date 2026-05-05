import { describe, expect, it } from "vitest";
import type { PublicParticipant } from "@yasp/shared";
import { makePublicRoomState } from "../test/roomState";
import { getLastWaitingVoter, shouldShowInviteHero } from "./room";

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

describe("getLastWaitingVoter", () => {
  it("returns the only connected voter who has not voted", () => {
    const state = makePublicRoomState({
      participants: [
        participant({
          id: "me",
          name: "Alice",
          isSelf: true,
          isModerator: true,
          hasVoted: true,
        }),
        participant({
          id: "bob",
          name: "Bob",
          hasVoted: false,
        }),
        participant({
          id: "cam",
          name: "Cam",
          hasVoted: true,
        }),
      ],
    });

    expect(getLastWaitingVoter(state)?.name).toBe("Bob");
  });

  it("returns null when multiple connected voters are still missing", () => {
    const state = makePublicRoomState({
      participants: [
        participant({
          id: "me",
          name: "Alice",
          isSelf: true,
          isModerator: true,
          hasVoted: true,
        }),
        participant({ id: "bob", name: "Bob", hasVoted: false }),
        participant({ id: "cam", name: "Cam", hasVoted: false }),
      ],
    });

    expect(getLastWaitingVoter(state)).toBeNull();
  });

  it("returns null after votes are revealed", () => {
    const state = makePublicRoomState({
      revealed: true,
      participants: [
        participant({
          id: "me",
          name: "Alice",
          isSelf: true,
          isModerator: true,
          hasVoted: true,
        }),
        participant({ id: "bob", name: "Bob", hasVoted: false }),
      ],
    });

    expect(getLastWaitingVoter(state)).toBeNull();
  });
});
