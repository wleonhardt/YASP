import { describe, expect, it } from "vitest";
import type { PublicParticipant } from "@yasp/shared";
import { makePublicRoomState } from "../test/roomState";
import { getLastWaitingVoter, getOutlierCallout, shouldShowInviteHero } from "./room";

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

describe("getOutlierCallout", () => {
  const deck = {
    type: "custom" as const,
    label: "Planning",
    cards: ["1", "2", "3", "5", "8", "13", "21"],
  };

  it("returns one voter more than two deck cards from the mode", () => {
    const state = makePublicRoomState({
      revealed: true,
      deck,
      participants: [
        participant({ id: "me", name: "Alice", hasVoted: true, isSelf: true, isModerator: true }),
        participant({ id: "bob", name: "Bob", hasVoted: true }),
        participant({ id: "cam", name: "Cam", hasVoted: true }),
      ],
      votes: { me: "5", bob: "21", cam: "5" },
      stats: {
        totalVotes: 3,
        numericAverage: 10.3,
        distribution: { "5": 2, "21": 1 },
        consensus: false,
        mostCommon: "5",
      },
    });

    expect(getOutlierCallout(state)).toMatchObject({
      modeVote: "5",
      outliers: [{ participant: expect.objectContaining({ name: "Bob" }), vote: "21" }],
    });
  });

  it("returns two voters but suppresses broader splits", () => {
    const twoOutliers = makePublicRoomState({
      revealed: true,
      deck,
      participants: [
        participant({ id: "me", name: "Alice", hasVoted: true, isSelf: true, isModerator: true }),
        participant({ id: "bob", name: "Bob", hasVoted: true }),
        participant({ id: "cam", name: "Cam", hasVoted: true }),
        participant({ id: "dee", name: "Dee", hasVoted: true }),
      ],
      votes: { me: "5", bob: "21", cam: "1", dee: "5" },
      stats: {
        totalVotes: 4,
        numericAverage: 8,
        distribution: { "1": 1, "5": 2, "21": 1 },
        consensus: false,
        mostCommon: "5",
      },
    });

    const broaderSplit = makePublicRoomState({
      ...twoOutliers,
      participants: [...twoOutliers.participants, participant({ id: "eli", name: "Eli", hasVoted: true })],
      votes: { me: "5", bob: "21", cam: "1", dee: "5", eli: "21" },
      stats: {
        totalVotes: 5,
        numericAverage: 10.6,
        distribution: { "1": 1, "5": 2, "21": 2 },
        consensus: false,
        mostCommon: "5",
      },
    });

    expect(getOutlierCallout(twoOutliers)?.outliers.map(({ participant }) => participant.name)).toEqual([
      "Bob",
      "Cam",
    ]);
    expect(getOutlierCallout(broaderSplit)).toBeNull();
  });

  it("returns null for consensus, ties, and non-deck votes", () => {
    const baseState = makePublicRoomState({
      revealed: true,
      deck,
      participants: [
        participant({ id: "me", name: "Alice", hasVoted: true, isSelf: true, isModerator: true }),
        participant({ id: "bob", name: "Bob", hasVoted: true }),
      ],
      votes: { me: "5", bob: "21" },
      stats: {
        totalVotes: 2,
        numericAverage: 13,
        distribution: { "5": 1, "21": 1 },
        consensus: false,
        mostCommon: "5",
      },
    });

    expect(
      getOutlierCallout(
        makePublicRoomState({ ...baseState, stats: { ...baseState.stats!, consensus: true } })
      )
    ).toBeNull();
    expect(
      getOutlierCallout(
        makePublicRoomState({ ...baseState, stats: { ...baseState.stats!, mostCommon: null } })
      )
    ).toBeNull();
    expect(
      getOutlierCallout(makePublicRoomState({ ...baseState, votes: { me: "5", bob: "coffee" } }))
    ).toBeNull();
  });
});
