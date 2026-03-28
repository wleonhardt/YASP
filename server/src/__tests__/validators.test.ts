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
  it("accepts non-empty strings", () => {
    expect(validateSessionId("abc-123")).toEqual({ valid: true });
  });

  it("rejects empty strings", () => {
    expect(validateSessionId("").valid).toBe(false);
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
