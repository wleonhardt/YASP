import { DEFAULT_DECKS, DEFAULT_ROOM_SETTINGS, type PublicRoomState } from "@yasp/shared";

const DEFAULT_TIMER_SECONDS = 60;

export function makePublicRoomState(overrides: Partial<PublicRoomState> = {}): PublicRoomState {
  return {
    id: "ROOM01",
    roundNumber: 1,
    revealed: false,
    currentStoryLabel: null,
    storyQueue: [],
    deck: DEFAULT_DECKS.fibonacci,
    settings: { ...DEFAULT_ROOM_SETTINGS },
    timer: {
      durationSeconds: DEFAULT_TIMER_SECONDS,
      remainingSeconds: DEFAULT_TIMER_SECONDS,
      running: false,
      endsAt: null,
      completedAt: null,
      lastHonkAt: null,
      honkAvailableAt: null,
    },
    participants: [
      {
        id: "me",
        name: "Alice",
        role: "voter",
        connected: true,
        hasVoted: false,
        isSelf: true,
        isModerator: true,
      },
    ],
    votes: null,
    stats: null,
    sessionRounds: [],
    me: {
      participantId: "me",
      sessionId: "session-1",
      connected: true,
      ownVote: null,
    },
    ...overrides,
  };
}
