import type {
  RoomId,
  ParticipantId,
  SessionId,
  VoteValue,
  ParticipantRole,
  PublicRoomState,
  RoomSettings,
} from "./types.js";

// --- Deck input ---

export type DeckInput =
  | { type: "fibonacci" }
  | { type: "modified_fibonacci" }
  | { type: "tshirt" }
  | { type: "powers_of_two" }
  | { type: "custom"; label: string; cards: string[] };

// --- Client to server ---

export type CreateRoomInput = {
  sessionId: SessionId;
  displayName: string;
  requestedRole: ParticipantRole;
  deck?: DeckInput;
};

export type CreateRoomOutput = {
  roomId: RoomId;
  state: PublicRoomState;
};

export type JoinRoomInput = {
  roomId: RoomId;
  sessionId: SessionId;
  displayName: string;
  requestedRole: ParticipantRole;
};

export type JoinRoomOutput = {
  state: PublicRoomState;
};

export type LeaveRoomInput = {
  roomId: RoomId;
};

export type CastVoteInput = {
  roomId: RoomId;
  value: VoteValue;
};

export type ClearVoteInput = {
  roomId: RoomId;
};

export type RevealVotesInput = {
  roomId: RoomId;
};

export type ResetRoundInput = {
  roomId: RoomId;
};

export type NextRoundInput = {
  roomId: RoomId;
};

export type TransferModeratorInput = {
  roomId: RoomId;
  targetParticipantId: ParticipantId;
};

export type ChangeNameInput = {
  roomId: RoomId;
  name: string;
};

export type ChangeRoleInput = {
  roomId: RoomId;
  role: ParticipantRole;
};

export type ChangeDeckInput = {
  roomId: RoomId;
  deck: DeckInput;
};

export type UpdateSettingsInput = {
  roomId: RoomId;
  settings: Partial<RoomSettings>;
};

export type PingInput = {
  roomId?: RoomId;
  clientTs: number;
};

// --- Server to client ---

export type RoomStateEvent = PublicRoomState;

export type PongEvent = {
  clientTs: number;
  serverTs: number;
};
