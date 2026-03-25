import type {
  RoomId,
  ParticipantId,
  SessionId,
  SocketId,
  VoteValue,
  ParticipantRole,
  Deck,
  RoomSettings,
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
  moderatorId: ParticipantId | null;
  participants: Map<ParticipantId, Participant>;
  votes: Map<ParticipantId, VoteValue>;
};
