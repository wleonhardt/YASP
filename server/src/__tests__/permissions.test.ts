import { describe, it, expect } from "vitest";
import * as permissions from "../domain/permissions.js";
import type { Room } from "../domain/types.js";
import { DEFAULT_ROOM_SETTINGS, DEFAULT_DECKS } from "@yasp/shared";

function makeRoom(overrides: Partial<Room> = {}): Room {
  return {
    id: "TEST01",
    createdAt: Date.now(),
    lastActivityAt: Date.now(),
    expiresAt: Date.now() + 86400000,
    revealed: false,
    roundNumber: 1,
    deck: DEFAULT_DECKS.fibonacci,
    settings: { ...DEFAULT_ROOM_SETTINGS },
    moderatorId: "mod-1",
    previousModeratorId: null,
    participants: new Map(),
    votes: new Map(),
    ...overrides,
  };
}

describe("permissions", () => {
  describe("isModerator", () => {
    it("returns true for moderator", () => {
      const room = makeRoom({ moderatorId: "user-1" });
      expect(permissions.isModerator(room, "user-1")).toBe(true);
    });

    it("returns false for non-moderator", () => {
      const room = makeRoom({ moderatorId: "user-1" });
      expect(permissions.isModerator(room, "user-2")).toBe(false);
    });
  });

  describe("canReveal", () => {
    it("allows moderator with moderator_only policy", () => {
      const room = makeRoom({
        moderatorId: "mod",
        settings: { ...DEFAULT_ROOM_SETTINGS, revealPolicy: "moderator_only" },
      });
      expect(permissions.canReveal(room, "mod")).toBe(true);
      expect(permissions.canReveal(room, "other")).toBe(false);
    });

    it("allows anyone with anyone policy", () => {
      const room = makeRoom({
        settings: { ...DEFAULT_ROOM_SETTINGS, revealPolicy: "anyone" },
      });
      expect(permissions.canReveal(room, "anyone")).toBe(true);
    });
  });

  describe("canReset", () => {
    it("follows reset policy", () => {
      const room = makeRoom({
        moderatorId: "mod",
        settings: { ...DEFAULT_ROOM_SETTINGS, resetPolicy: "moderator_only" },
      });
      expect(permissions.canReset(room, "mod")).toBe(true);
      expect(permissions.canReset(room, "other")).toBe(false);
    });
  });

  describe("canNextRound", () => {
    it("follows reset policy (same as reset in v1)", () => {
      const room = makeRoom({
        moderatorId: "mod",
        settings: { ...DEFAULT_ROOM_SETTINGS, resetPolicy: "anyone" },
      });
      expect(permissions.canNextRound(room, "random")).toBe(true);
    });
  });

  describe("canChangeDeck", () => {
    it("follows deckChangePolicy", () => {
      const room = makeRoom({
        moderatorId: "mod",
        settings: { ...DEFAULT_ROOM_SETTINGS, deckChangePolicy: "moderator_only" },
      });
      expect(permissions.canChangeDeck(room, "mod")).toBe(true);
      expect(permissions.canChangeDeck(room, "other")).toBe(false);
    });
  });

  describe("canUpdateSettings", () => {
    it("is moderator only in v1", () => {
      const room = makeRoom({ moderatorId: "mod" });
      expect(permissions.canUpdateSettings(room, "mod")).toBe(true);
      expect(permissions.canUpdateSettings(room, "other")).toBe(false);
    });
  });

  describe("setting-based permissions", () => {
    it("canChangeName follows allowNameChange", () => {
      expect(
        permissions.canChangeName(makeRoom({ settings: { ...DEFAULT_ROOM_SETTINGS, allowNameChange: true } }))
      ).toBe(true);
      expect(
        permissions.canChangeName(
          makeRoom({ settings: { ...DEFAULT_ROOM_SETTINGS, allowNameChange: false } })
        )
      ).toBe(false);
    });

    it("canChangeRole follows allowSelfRoleSwitch", () => {
      expect(
        permissions.canChangeRole(
          makeRoom({ settings: { ...DEFAULT_ROOM_SETTINGS, allowSelfRoleSwitch: true } })
        )
      ).toBe(true);
      expect(
        permissions.canChangeRole(
          makeRoom({ settings: { ...DEFAULT_ROOM_SETTINGS, allowSelfRoleSwitch: false } })
        )
      ).toBe(false);
    });

    it("canBeSpectator follows allowSpectators", () => {
      expect(
        permissions.canBeSpectator(
          makeRoom({ settings: { ...DEFAULT_ROOM_SETTINGS, allowSpectators: true } })
        )
      ).toBe(true);
      expect(
        permissions.canBeSpectator(
          makeRoom({ settings: { ...DEFAULT_ROOM_SETTINGS, allowSpectators: false } })
        )
      ).toBe(false);
    });
  });
});
