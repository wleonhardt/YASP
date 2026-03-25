export type RoomId = string;
export type ParticipantId = string;
export type SessionId = string;
export type SocketId = string;
export type VoteValue = string;
export type DeckType =
  | "fibonacci"
  | "modified_fibonacci"
  | "tshirt"
  | "powers_of_two"
  | "custom";
export type ParticipantRole = "voter" | "spectator";
export type PermissionPolicy = "moderator_only" | "anyone";

export type Deck = {
  type: DeckType;
  label: string;
  cards: string[];
};

export type RoomSettings = {
  allowSpectators: boolean;
  allowNameChange: boolean;
  allowSelfRoleSwitch: boolean;
  revealPolicy: PermissionPolicy;
  resetPolicy: PermissionPolicy;
  deckChangePolicy: PermissionPolicy;
  autoReveal: boolean;
  autoRevealDelayMs: number;
};

export type PublicParticipant = {
  id: ParticipantId;
  name: string;
  role: ParticipantRole;
  connected: boolean;
  hasVoted: boolean;
  isSelf: boolean;
  isModerator: boolean;
};

export type RevealStats = {
  totalVotes: number;
  numericAverage: number | null;
  distribution: Record<string, number>;
  consensus: boolean;
  mostCommon: string | null;
};

export type PublicRoomState = {
  id: RoomId;
  title?: string;
  roundNumber: number;
  revealed: boolean;
  deck: Deck;
  settings: RoomSettings;
  participants: PublicParticipant[];
  votes: Record<ParticipantId, VoteValue> | null;
  stats: RevealStats | null;
  me: {
    participantId: ParticipantId | null;
    sessionId: SessionId;
    connected: boolean;
  };
};

export type PublicConfig = {
  appName: string;
  roomTtlMs: number;
  disconnectedParticipantGraceMs: number;
  defaultSettings: RoomSettings;
  defaultDecks: Deck[];
};

export type ErrorCode =
  | "ROOM_NOT_FOUND"
  | "ROOM_EXPIRED"
  | "INVALID_NAME"
  | "INVALID_ROOM_ID"
  | "INVALID_ROLE"
  | "INVALID_DECK"
  | "INVALID_VOTE"
  | "SPECTATORS_DISABLED"
  | "NAME_CHANGE_DISABLED"
  | "ROLE_CHANGE_DISABLED"
  | "NOT_ALLOWED"
  | "ALREADY_REVEALED"
  | "NOT_REVEALED"
  | "PARTICIPANT_NOT_FOUND"
  | "SESSION_REPLACED"
  | "INTERNAL_ERROR";

export type ServerErrorEvent = {
  code: ErrorCode;
  message: string;
};

export type AckSuccess<T = undefined> = {
  ok: true;
  data: T;
};

export type AckFailure = {
  ok: false;
  error: ServerErrorEvent;
};

export type AckResult<T = undefined> = AckSuccess<T> | AckFailure;

export const DEFAULT_DECKS: Record<Exclude<DeckType, "custom">, Deck> = {
  fibonacci: {
    type: "fibonacci",
    label: "Fibonacci",
    cards: ["0", "1", "2", "3", "5", "8", "13", "21", "34", "55", "89", "?", "coffee"],
  },
  modified_fibonacci: {
    type: "modified_fibonacci",
    label: "Modified Fibonacci",
    cards: ["0", "0.5", "1", "2", "3", "5", "8", "13", "20", "40", "100", "?", "coffee"],
  },
  tshirt: {
    type: "tshirt",
    label: "T-Shirt",
    cards: ["XS", "S", "M", "L", "XL", "XXL", "?", "coffee"],
  },
  powers_of_two: {
    type: "powers_of_two",
    label: "Powers of Two",
    cards: ["1", "2", "4", "8", "16", "32", "64", "?", "coffee"],
  },
};

export const DEFAULT_ROOM_SETTINGS: RoomSettings = {
  allowSpectators: true,
  allowNameChange: true,
  allowSelfRoleSwitch: true,
  revealPolicy: "moderator_only",
  resetPolicy: "moderator_only",
  deckChangePolicy: "moderator_only",
  autoReveal: false,
  autoRevealDelayMs: 1500,
};
