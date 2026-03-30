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
};

export type Room = {
  id: RoomId;
  createdAt: number;
  lastActivityAt: number;
  expiresAt: number;
  revealed: boolean;
  roundNumber: number;
  title?: string;
  deck: Deck;
  settings: RoomSettings;
  timer: RoomTimerState;
  moderatorId: ParticipantId | null;
  /** Set when moderator is auto-transferred on disconnect; cleared on restore or manual transfer. */
  previousModeratorId: ParticipantId | null;
  participants: Map<ParticipantId, Participant>;
  votes: Map<ParticipantId, VoteValue>;
};
