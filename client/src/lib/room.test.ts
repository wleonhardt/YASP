import { describe, expect, it } from "vitest";
import type { PublicParticipant } from "@yasp/shared";
import { makePublicRoomState } from "../test/roomState";
import {
  DEFAULT_TIMER_DURATION_SECONDS,
  getAlmostConsensusCallout,
  getLastWaitingVoter,
  getOutlierCallout,
  isTimerStripRelevant,
  shouldShowInviteHero,
  shouldShowStoryAgenda,
} from "./room";

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

describe("shouldShowStoryAgenda", () => {
  it("hides the agenda by default for an empty room", () => {
    expect(shouldShowStoryAgenda(makePublicRoomState(), false)).toBe(false);
  });

  it("shows the agenda when the room has a current story label", () => {
    expect(shouldShowStoryAgenda(makePublicRoomState({ currentStoryLabel: "YASP-123" }), false)).toBe(true);
  });

  it("shows the agenda when the room has queued stories", () => {
    expect(
      shouldShowStoryAgenda(
        makePublicRoomState({
          storyQueue: [{ id: "story-1", label: "Add deck keyboard hints" }],
        }),
        false
      )
    ).toBe(true);
  });

  it("lets moderators opt into the empty agenda", () => {
    expect(shouldShowStoryAgenda(makePublicRoomState(), true)).toBe(true);
  });

  it("does not let non-moderators opt into the empty agenda", () => {
    expect(
      shouldShowStoryAgenda(
        makePublicRoomState({
          participants: [participant({ id: "me", name: "Alice", isSelf: true, isModerator: false })],
        }),
        true
      )
    ).toBe(false);
  });
});

describe("isTimerStripRelevant", () => {
  it("hides the timer strip for the untouched default timer", () => {
    expect(isTimerStripRelevant(makePublicRoomState())).toBe(false);
  });

  it("shows the timer strip while the timer is running", () => {
    expect(
      isTimerStripRelevant(
        makePublicRoomState({
          timer: {
            durationSeconds: DEFAULT_TIMER_DURATION_SECONDS,
            remainingSeconds: DEFAULT_TIMER_DURATION_SECONDS,
            running: true,
            endsAt: Date.now() + DEFAULT_TIMER_DURATION_SECONDS * 1000,
            completedAt: null,
            lastHonkAt: null,
            honkAvailableAt: null,
          },
        })
      )
    ).toBe(true);
  });

  it("shows the timer strip after the default timer has been used", () => {
    expect(
      isTimerStripRelevant(
        makePublicRoomState({
          timer: {
            durationSeconds: DEFAULT_TIMER_DURATION_SECONDS,
            remainingSeconds: 42,
            running: false,
            endsAt: null,
            completedAt: null,
            lastHonkAt: null,
            honkAvailableAt: null,
          },
        })
      )
    ).toBe(true);
  });

  it("shows the timer strip for non-default durations and completed timers", () => {
    expect(
      isTimerStripRelevant(
        makePublicRoomState({
          timer: {
            durationSeconds: 120,
            remainingSeconds: 120,
            running: false,
            endsAt: null,
            completedAt: null,
            lastHonkAt: null,
            honkAvailableAt: null,
          },
        })
      )
    ).toBe(true);
    expect(
      isTimerStripRelevant(
        makePublicRoomState({
          timer: {
            durationSeconds: DEFAULT_TIMER_DURATION_SECONDS,
            remainingSeconds: 0,
            running: false,
            endsAt: null,
            completedAt: Date.now(),
            lastHonkAt: null,
            honkAvailableAt: null,
          },
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

describe("getAlmostConsensusCallout", () => {
  it("returns the only voter whose estimate differs from the shared estimate", () => {
    const state = makePublicRoomState({
      revealed: true,
      participants: [
        participant({ id: "me", name: "Alice", hasVoted: true, isSelf: true, isModerator: true }),
        participant({ id: "bob", name: "Bob", hasVoted: true }),
        participant({ id: "cam", name: "Cam", hasVoted: true }),
        participant({ id: "dee", name: "Dee", hasVoted: true }),
      ],
      votes: { me: "5", bob: "5", cam: "8", dee: "5" },
      stats: {
        totalVotes: 4,
        numericAverage: 5.75,
        distribution: { "5": 3, "8": 1 },
        consensus: false,
        mostCommon: "5",
      },
    });

    expect(getAlmostConsensusCallout(state)).toMatchObject({
      kind: "almostConsensus",
      modeVote: "5",
      outliers: [{ participant: expect.objectContaining({ name: "Cam" }), vote: "8" }],
    });
  });

  it("returns null for two-person splits and broader disagreement", () => {
    const twoPersonSplit = makePublicRoomState({
      revealed: true,
      participants: [
        participant({ id: "me", name: "Alice", hasVoted: true, isSelf: true, isModerator: true }),
        participant({ id: "bob", name: "Bob", hasVoted: true }),
      ],
      votes: { me: "5", bob: "8" },
      stats: {
        totalVotes: 2,
        numericAverage: 6.5,
        distribution: { "5": 1, "8": 1 },
        consensus: false,
        mostCommon: "5",
      },
    });
    const broaderDisagreement = makePublicRoomState({
      ...twoPersonSplit,
      participants: [
        participant({ id: "me", name: "Alice", hasVoted: true, isSelf: true, isModerator: true }),
        participant({ id: "bob", name: "Bob", hasVoted: true }),
        participant({ id: "cam", name: "Cam", hasVoted: true }),
        participant({ id: "dee", name: "Dee", hasVoted: true }),
      ],
      votes: { me: "5", bob: "8", cam: "13", dee: "5" },
      stats: {
        totalVotes: 4,
        numericAverage: 7.75,
        distribution: { "5": 2, "8": 1, "13": 1 },
        consensus: false,
        mostCommon: "5",
      },
    });

    expect(getAlmostConsensusCallout(twoPersonSplit)).toBeNull();
    expect(getAlmostConsensusCallout(broaderDisagreement)).toBeNull();
  });

  it("returns null for consensus and ties", () => {
    const baseState = makePublicRoomState({
      revealed: true,
      participants: [
        participant({ id: "me", name: "Alice", hasVoted: true, isSelf: true, isModerator: true }),
        participant({ id: "bob", name: "Bob", hasVoted: true }),
        participant({ id: "cam", name: "Cam", hasVoted: true }),
      ],
      votes: { me: "5", bob: "5", cam: "8" },
      stats: {
        totalVotes: 3,
        numericAverage: 6,
        distribution: { "5": 2, "8": 1 },
        consensus: false,
        mostCommon: "5",
      },
    });

    expect(
      getAlmostConsensusCallout(
        makePublicRoomState({ ...baseState, stats: { ...baseState.stats!, consensus: true } })
      )
    ).toBeNull();
    expect(
      getAlmostConsensusCallout(
        makePublicRoomState({ ...baseState, stats: { ...baseState.stats!, mostCommon: null } })
      )
    ).toBeNull();
  });
});
