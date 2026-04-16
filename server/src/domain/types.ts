import type {
  RoomId,
  ParticipantId,
  SessionId,
  SocketId,
  VoteValue,
  ParticipantRole,
  Deck,
  RoomSettings,
  RoomTimerState,
  SessionRoundSnapshot,
} from "@yasp/shared";

export type Participant = {
  id: ParticipantId;
  sessionId: SessionId;
  name: string;
  role: ParticipantRole;
  connected: boolean;
  socketId: SocketId | null;
  joinedAt: number;
  lastSeenAt: number;
  /**
   * Wall-clock ms timestamp of this participant's most recent honk in this
   * room, or `undefined` if they have not honked. Used by the per-participant
   * honk cooldown (see `PARTICIPANT_HONK_COOLDOWN_MS`). Server-only; never
   * serialized to clients.
   */
  lastHonkAt?: number;
};

export type Room = {
  id: RoomId;
  createdAt: number;
  lastActivityAt: number;
  expiresAt: number;
  /**
   * True once the room has had meaningful activity beyond the initial create
   * (a second participant joined, a vote was cast, a reveal/reset/deck change,
   * settings change, etc.). Set inside `touchRoom`. Used by disconnect handling
   * to apply the shorter EMPTY_ROOM_TTL_MS to rooms that were created but
   * never actually used, so abandoned/spam rooms don't linger for 12 h.
   */
  hasBeenActive: boolean;
  revealed: boolean;
  roundNumber: number;
  title?: string;
  deck: Deck;
  settings: RoomSettings;
  timer: RoomTimerState;
  moderatorId: ParticipantId | null;
  /** Set when moderator is auto-transferred on disconnect; cleared on restore or manual transfer. */
  previousModeratorId: ParticipantId | null;
  participants: Map<SessionId, Participant>;
  votes: Map<ParticipantId, VoteValue>;
  sessionRounds: SessionRoundSnapshot[];
};
