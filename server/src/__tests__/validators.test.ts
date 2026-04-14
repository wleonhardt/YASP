import { describe, it, expect } from "vitest";
import {
  validateName,
  sanitizeName,
  validateRole,
  validateDeckInput,
  normalizeDeckInput,
  validateVote,
  validateRoomId,
  validateSessionId,
  validateSettingsUpdate,
  validateRoomTitle,
  sanitizeRoomTitle,
  MAX_CUSTOM_DECK_LABEL_LENGTH,
  MAX_ROOM_TITLE_LENGTH,
} from "../transport/validators.js";

describe("validateName", () => {
  it("accepts valid names", () => {
    expect(validateName("Alice")).toEqual({ valid: true });
    expect(validateName("A")).toEqual({ valid: true });
    expect(validateName("  Bob  ")).toEqual({ valid: true });
  });

  it("rejects empty names", () => {
    const r = validateName("");
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.error.code).toBe("INVALID_NAME");
  });

  it("rejects all-whitespace names", () => {
    const r = validateName("   ");
    expect(r.valid).toBe(false);
  });

  it("rejects names over 30 characters", () => {
    const r = validateName("a".repeat(31));
    expect(r.valid).toBe(false);
  });

  it("rejects non-string names", () => {
    const r = validateName(123);
    expect(r.valid).toBe(false);
  });
});

describe("sanitizeName", () => {
  it("trims whitespace", () => {
    expect(sanitizeName("  Alice  ")).toBe("Alice");
  });
});

describe("validateRole", () => {
  it("accepts voter and spectator", () => {
    expect(validateRole("voter")).toEqual({ valid: true });
    expect(validateRole("spectator")).toEqual({ valid: true });
  });

  it("rejects invalid roles", () => {
    const r = validateRole("admin");
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.error.code).toBe("INVALID_ROLE");
  });
});

describe("validateDeckInput", () => {
  it("accepts standard deck types", () => {
    expect(validateDeckInput({ type: "fibonacci" })).toEqual({ valid: true });
    expect(validateDeckInput({ type: "tshirt" })).toEqual({ valid: true });
  });

  it("accepts valid custom deck", () => {
    const r = validateDeckInput({ type: "custom", label: "My Deck", cards: ["1", "2", "3"] });
    expect(r).toEqual({ valid: true });
  });

  it("rejects custom deck without cards", () => {
    const r = validateDeckInput({ type: "custom", label: "X", cards: [] });
    expect(r.valid).toBe(false);
  });

  it("rejects custom deck with >30 cards", () => {
    const cards = Array.from({ length: 31 }, (_, i) => String(i));
    const r = validateDeckInput({ type: "custom", label: "X", cards });
    expect(r.valid).toBe(false);
  });

  it("rejects custom deck with label >12 chars", () => {
    const r = validateDeckInput({ type: "custom", label: "X", cards: ["a".repeat(13)] });
    expect(r.valid).toBe(false);
  });

  it("rejects duplicate card labels after normalization", () => {
    const r = validateDeckInput({ type: "custom", label: "X", cards: ["  a ", "a"] });
    expect(r.valid).toBe(false);
  });

  it("rejects empty card labels", () => {
    const r = validateDeckInput({ type: "custom", label: "X", cards: ["  "] });
    expect(r.valid).toBe(false);
  });

  it("rejects invalid types", () => {
    const r = validateDeckInput({ type: "invalid" });
    expect(r.valid).toBe(false);
  });

  it(`accepts custom deck label at exactly ${MAX_CUSTOM_DECK_LABEL_LENGTH} characters`, () => {
    const r = validateDeckInput({
      type: "custom",
      label: "a".repeat(MAX_CUSTOM_DECK_LABEL_LENGTH),
      cards: ["1", "2"],
    });
    expect(r).toEqual({ valid: true });
  });

  it(`rejects custom deck label over ${MAX_CUSTOM_DECK_LABEL_LENGTH} characters (F-02)`, () => {
    const r = validateDeckInput({
      type: "custom",
      label: "a".repeat(MAX_CUSTOM_DECK_LABEL_LENGTH + 1),
      cards: ["1", "2"],
    });
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.error.code).toBe("INVALID_DECK");
  });

  it("applies the label cap after trimming leading/trailing whitespace", () => {
    // Padded length > cap but trimmed length == cap → accepted.
    const padded = "  " + "a".repeat(MAX_CUSTOM_DECK_LABEL_LENGTH) + "  ";
    const r = validateDeckInput({ type: "custom", label: padded, cards: ["1"] });
    expect(r).toEqual({ valid: true });
  });
});

describe("normalizeDeckInput", () => {
  it("normalizes custom deck labels", () => {
    const result = normalizeDeckInput({
      type: "custom",
      label: "  My Deck  ",
      cards: ["  a   b  ", " c "],
    });
    expect(result).toEqual({
      type: "custom",
      label: "My Deck",
      cards: ["a b", "c"],
    });
  });

  it("passes through standard types unchanged", () => {
    const input = { type: "fibonacci" as const };
    expect(normalizeDeckInput(input)).toBe(input);
  });
});

describe("validateVote", () => {
  const cards = ["1", "2", "3", "?", "coffee"];

  it("accepts valid votes", () => {
    expect(validateVote("1", cards)).toEqual({ valid: true });
    expect(validateVote("coffee", cards)).toEqual({ valid: true });
  });

  it("rejects votes not in deck", () => {
    const r = validateVote("99", cards);
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.error.code).toBe("INVALID_VOTE");
  });

  it("rejects non-string votes", () => {
    const r = validateVote(1, cards);
    expect(r.valid).toBe(false);
  });
});

describe("validateRoomId", () => {
  it("accepts valid room IDs", () => {
    expect(validateRoomId("Q7KP9D")).toEqual({ valid: true });
    expect(validateRoomId("ABCDEF12")).toEqual({ valid: true });
  });

  it("rejects short IDs", () => {
    expect(validateRoomId("ABC").valid).toBe(false);
  });

  it("rejects lowercase IDs", () => {
    expect(validateRoomId("abcdef").valid).toBe(false);
  });

  it("rejects IDs with special characters", () => {
    expect(validateRoomId("ABC-DE").valid).toBe(false);
  });
});

describe("validateSessionId", () => {
  it("accepts valid UUID v4", () => {
    expect(validateSessionId("550e8400-e29b-41d4-a716-446655440000")).toEqual({ valid: true });
    expect(validateSessionId("6ba7b810-9dad-41d6-8BbB-010203040506")).toEqual({ valid: true });
  });

  it("rejects empty strings", () => {
    expect(validateSessionId("").valid).toBe(false);
  });

  it("rejects non-UUID strings", () => {
    expect(validateSessionId("abc-123").valid).toBe(false);
    expect(validateSessionId("not-a-uuid-at-all").valid).toBe(false);
  });

  it("rejects UUID v1 format", () => {
    // UUID v1 has version nibble '1' instead of '4'
    expect(validateSessionId("550e8400-e29b-11d4-a716-446655440000").valid).toBe(false);
  });
});

describe("validateRoomTitle (F-02 future-use helper)", () => {
  it("accepts undefined and null as 'no title set'", () => {
    expect(validateRoomTitle(undefined)).toEqual({ valid: true });
    expect(validateRoomTitle(null)).toEqual({ valid: true });
  });

  it("accepts a normal title", () => {
    expect(validateRoomTitle("Sprint 42 planning")).toEqual({ valid: true });
  });

  it("accepts a title at exactly the cap", () => {
    expect(validateRoomTitle("t".repeat(MAX_ROOM_TITLE_LENGTH))).toEqual({ valid: true });
  });

  it("accepts an empty string (means 'clear title')", () => {
    expect(validateRoomTitle("")).toEqual({ valid: true });
    expect(validateRoomTitle("   ")).toEqual({ valid: true });
  });

  it("rejects a non-string title", () => {
    const r = validateRoomTitle(123);
    expect(r.valid).toBe(false);
  });

  it(`rejects a title over ${MAX_ROOM_TITLE_LENGTH} characters`, () => {
    const r = validateRoomTitle("t".repeat(MAX_ROOM_TITLE_LENGTH + 1));
    expect(r.valid).toBe(false);
  });

  it("applies the cap after trimming outer whitespace", () => {
    const padded = "  " + "t".repeat(MAX_ROOM_TITLE_LENGTH) + "  ";
    expect(validateRoomTitle(padded)).toEqual({ valid: true });
  });
});

describe("sanitizeRoomTitle", () => {
  it("returns undefined for missing/blank input", () => {
    expect(sanitizeRoomTitle(undefined)).toBeUndefined();
    expect(sanitizeRoomTitle(null)).toBeUndefined();
    expect(sanitizeRoomTitle("   ")).toBeUndefined();
  });

  it("trims outer whitespace but preserves interior spaces", () => {
    expect(sanitizeRoomTitle("  Sprint  42  ")).toBe("Sprint  42");
  });
});

describe("validateSettingsUpdate", () => {
  it("accepts valid partial settings", () => {
    expect(validateSettingsUpdate({ autoReveal: true })).toEqual({ valid: true });
    expect(validateSettingsUpdate({ revealPolicy: "anyone" })).toEqual({ valid: true });
  });

  it("rejects invalid boolean", () => {
    expect(validateSettingsUpdate({ autoReveal: "yes" }).valid).toBe(false);
  });

  it("rejects invalid policy", () => {
    expect(validateSettingsUpdate({ revealPolicy: "invalid" }).valid).toBe(false);
  });

  it("rejects non-object", () => {
    expect(validateSettingsUpdate(null).valid).toBe(false);
  });
});
