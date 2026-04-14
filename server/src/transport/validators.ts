import type { ServerErrorEvent, DeckType, RoomSettings } from "@yasp/shared";
import type { DeckInput } from "@yasp/shared";

export type ValidationResult = { valid: true } | { valid: false; error: ServerErrorEvent };

// Cap on the free-text label attached to a custom deck. Prevents an abusive
// client from stuffing a multi-kB string into a field that gets rebroadcast
// as part of every room_state push (F-02).
export const MAX_CUSTOM_DECK_LABEL_LENGTH = 60;

// Cap on the room title field. No socket event writes `room.title` today —
// this validator is provided so any future title-setting code path has a
// canonical boundary check ready (F-02: "future footgun"). Matches the
// custom-deck-label cap so both user-visible-string surfaces agree.
export const MAX_ROOM_TITLE_LENGTH = 60;

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
    if (deck.label.trim().length > MAX_CUSTOM_DECK_LABEL_LENGTH) {
      return {
        valid: false,
        error: {
          code: "INVALID_DECK",
          message: `Custom deck label must be at most ${MAX_CUSTOM_DECK_LABEL_LENGTH} characters`,
        },
      };
    }
    if (!Array.isArray(deck.cards) || deck.cards.length === 0) {
      return {
        valid: false,
        error: { code: "INVALID_DECK", message: "Custom deck must have at least one card" },
      };
    }
    if (deck.cards.length > 30) {
      return {
        valid: false,
        error: { code: "INVALID_DECK", message: "Custom deck can have at most 30 cards" },
      };
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
        return {
          valid: false,
          error: { code: "INVALID_DECK", message: "Card labels must be at most 12 characters" },
        };
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

const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function validateSessionId(sessionId: unknown): ValidationResult {
  if (typeof sessionId !== "string" || !UUID_V4_RE.test(sessionId)) {
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

/**
 * Canonical validator for an optional room title. Not wired to any current
 * socket event — `shared/src/types.ts` exposes `title?: string` on the public
 * room state, but there is no create/update-title operation in the event
 * surface today. F-02 flags this field as a future footgun: any code that
 * later writes `room.title` from user input MUST go through this helper so
 * we don't ship the same "unbounded user string broadcast back to every
 * room member" issue we just fixed on the custom deck label.
 *
 * Semantics:
 *  - `undefined` / `null` → valid (title is optional)
 *  - string → trimmed; empty-after-trim is valid (means "clear title")
 *  - non-string → invalid
 *  - >`MAX_ROOM_TITLE_LENGTH` after trim → invalid
 *  - interior whitespace is preserved (matches `sanitizeName`'s "trim only"
 *    posture — do not collapse spaces; users may legitimately want them)
 *
 * Callers should use `sanitizeRoomTitle` to get the normalized value to
 * store, after a successful `validateRoomTitle` check.
 */
export function validateRoomTitle(title: unknown): ValidationResult {
  if (title === undefined || title === null) return { valid: true };
  if (typeof title !== "string") {
    return { valid: false, error: { code: "INTERNAL_ERROR", message: "Title must be a string" } };
  }
  if (title.trim().length > MAX_ROOM_TITLE_LENGTH) {
    return {
      valid: false,
      error: {
        code: "INTERNAL_ERROR",
        message: `Title must be at most ${MAX_ROOM_TITLE_LENGTH} characters`,
      },
    };
  }
  return { valid: true };
}

/**
 * Normalize a room title after `validateRoomTitle` has accepted it. Returns
 * `undefined` for absent or whitespace-only input so callers can delete the
 * field rather than store an empty string. Intentionally does NOT collapse
 * interior whitespace (see `validateRoomTitle`).
 */
export function sanitizeRoomTitle(title: string | undefined | null): string | undefined {
  if (typeof title !== "string") return undefined;
  const trimmed = title.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

export function validateSettingsUpdate(settings: unknown): ValidationResult {
  if (!settings || typeof settings !== "object") {
    return { valid: false, error: { code: "INTERNAL_ERROR", message: "Settings must be an object" } };
  }
  const s = settings as Partial<RoomSettings>;
  const boolKeys: (keyof RoomSettings)[] = [
    "allowSpectators",
    "allowNameChange",
    "allowSelfRoleSwitch",
    "autoReveal",
  ];
  for (const key of boolKeys) {
    if (key in s && typeof s[key] !== "boolean") {
      return { valid: false, error: { code: "INTERNAL_ERROR", message: `${key} must be a boolean` } };
    }
  }
  const policyKeys: (keyof RoomSettings)[] = ["revealPolicy", "resetPolicy", "deckChangePolicy"];
  for (const key of policyKeys) {
    if (key in s && s[key] !== "moderator_only" && s[key] !== "anyone") {
      return {
        valid: false,
        error: { code: "INTERNAL_ERROR", message: `${key} must be 'moderator_only' or 'anyone'` },
      };
    }
  }
  if ("autoRevealDelayMs" in s) {
    if (typeof s.autoRevealDelayMs !== "number" || s.autoRevealDelayMs < 0 || s.autoRevealDelayMs > 30_000) {
      return {
        valid: false,
        error: { code: "INTERNAL_ERROR", message: "autoRevealDelayMs must be between 0 and 30000" },
      };
    }
  }
  return { valid: true };
}
