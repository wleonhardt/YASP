import { DEFAULT_DECKS, DEFAULT_ROOM_SETTINGS, type PublicRoomState } from "@yasp/shared";

export function makePublicRoomState(overrides: Partial<PublicRoomState> = {}): PublicRoomState {
  return {
    id: "ROOM01",
    roundNumber: 1,
    revealed: false,
    deck: DEFAULT_DECKS.fibonacci,
    settings: { ...DEFAULT_ROOM_SETTINGS },
    timer: {
      durationSeconds: 60,
      remainingSeconds: 60,
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
    me: {
      participantId: "me",
      sessionId: "session-1",
      connected: true,
    },
    ...overrides,
  };
}
