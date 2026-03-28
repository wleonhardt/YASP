import type { ServerErrorEvent, DeckType, RoomSettings } from "@yasp/shared";
import type { DeckInput } from "@yasp/shared";

export type ValidationResult =
  | { valid: true }
  | { valid: false; error: ServerErrorEvent };

export function validateName(name: unknown): ValidationResult {
  if (typeof name !== "string") {
    return { valid: false, error: { code: "INVALID_NAME", message: "Name must be a string" } };
  }
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    return { valid: false, error: { code: "INVALID_NAME", message: "Name cannot be empty" } };
  }
  if (trimmed.length > 30) {
    return { valid: false, error: { code: "INVALID_NAME", message: "Name must be at most 30 characters" } };
  }
  return { valid: true };
}

export function sanitizeName(name: string): string {
  return name.trim();
}

export function validateRole(role: unknown): ValidationResult {
  if (role !== "voter" && role !== "spectator") {
    return { valid: false, error: { code: "INVALID_ROLE", message: "Role must be 'voter' or 'spectator'" } };
  }
  return { valid: true };
}

function normalizeCardLabel(label: string): string {
  return label.trim().replace(/\s+/g, " ");
}

export function validateDeckInput(input: unknown): ValidationResult {
  if (!input || typeof input !== "object") {
    return { valid: false, error: { code: "INVALID_DECK", message: "Deck input is required" } };
  }

  const deck = input as Record<string, unknown>;
  const validTypes: DeckType[] = ["fibonacci", "modified_fibonacci", "tshirt", "powers_of_two", "custom"];
  if (!validTypes.includes(deck.type as DeckType)) {
    return { valid: false, error: { code: "INVALID_DECK", message: "Invalid deck type" } };
  }

  if (deck.type === "custom") {
    if (typeof deck.label !== "string" || deck.label.trim().length === 0) {
      return { valid: false, error: { code: "INVALID_DECK", message: "Custom deck must have a label" } };
    }
    if (!Array.isArray(deck.cards) || deck.cards.length === 0) {
      return { valid: false, error: { code: "INVALID_DECK", message: "Custom deck must have at least one card" } };
    }
    if (deck.cards.length > 30) {
      return { valid: false, error: { code: "INVALID_DECK", message: "Custom deck can have at most 30 cards" } };
    }
    const normalized: string[] = [];
    for (const card of deck.cards) {
      if (typeof card !== "string") {
        return { valid: false, error: { code: "INVALID_DECK", message: "Card labels must be strings" } };
      }
      const norm = normalizeCardLabel(card);
      if (norm.length === 0) {
        return { valid: false, error: { code: "INVALID_DECK", message: "Card labels cannot be empty" } };
      }
      if (norm.length > 12) {
        return { valid: false, error: { code: "INVALID_DECK", message: "Card labels must be at most 12 characters" } };
      }
      if (normalized.includes(norm)) {
        return { valid: false, error: { code: "INVALID_DECK", message: `Duplicate card label: "${norm}"` } };
      }
      normalized.push(norm);
    }
  }

  return { valid: true };
}

export function normalizeDeckInput(input: DeckInput): DeckInput {
  if (input.type !== "custom") return input;
  return {
    type: "custom",
    label: input.label.trim(),
    cards: input.cards.map((c) => normalizeCardLabel(c)),
  };
}

export function validateVote(value: unknown, deckCards: string[]): ValidationResult {
  if (typeof value !== "string") {
    return { valid: false, error: { code: "INVALID_VOTE", message: "Vote must be a string" } };
  }
  if (!deckCards.includes(value)) {
    return { valid: false, error: { code: "INVALID_VOTE", message: "Vote value not in current deck" } };
  }
  return { valid: true };
}

export function validateSessionId(sessionId: unknown): ValidationResult {
  if (typeof sessionId !== "string" || sessionId.trim().length === 0) {
    return { valid: false, error: { code: "INTERNAL_ERROR", message: "Invalid session ID" } };
  }
  return { valid: true };
}

export function validateRoomId(roomId: unknown): ValidationResult {
  if (typeof roomId !== "string") {
    return { valid: false, error: { code: "INVALID_ROOM_ID", message: "Room ID must be a string" } };
  }
  if (!/^[A-Z0-9]{6,10}$/.test(roomId)) {
    return { valid: false, error: { code: "INVALID_ROOM_ID", message: "Invalid room ID format" } };
  }
  return { valid: true };
}

export function validateSettingsUpdate(settings: unknown): ValidationResult {
  if (!settings || typeof settings !== "object") {
    return { valid: false, error: { code: "INTERNAL_ERROR", message: "Settings must be an object" } };
  }
  const s = settings as Partial<RoomSettings>;
  const boolKeys: (keyof RoomSettings)[] = [
    "allowSpectators", "allowNameChange", "allowSelfRoleSwitch", "autoReveal",
  ];
  for (const key of boolKeys) {
    if (key in s && typeof s[key] !== "boolean") {
      return { valid: false, error: { code: "INTERNAL_ERROR", message: `${key} must be a boolean` } };
    }
  }
  const policyKeys: (keyof RoomSettings)[] = ["revealPolicy", "resetPolicy", "deckChangePolicy"];
  for (const key of policyKeys) {
    if (key in s && s[key] !== "moderator_only" && s[key] !== "anyone") {
      return { valid: false, error: { code: "INTERNAL_ERROR", message: `${key} must be 'moderator_only' or 'anyone'` } };
    }
  }
  if ("autoRevealDelayMs" in s) {
    if (typeof s.autoRevealDelayMs !== "number" || s.autoRevealDelayMs < 0) {
      return { valid: false, error: { code: "INTERNAL_ERROR", message: "autoRevealDelayMs must be a non-negative number" } };
    }
  }
  return { valid: true };
}
