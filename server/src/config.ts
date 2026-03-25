import { DEFAULT_ROOM_SETTINGS, DEFAULT_DECKS } from "@yasp/shared";
import type { PublicConfig } from "@yasp/shared";

export const PORT = parseInt(process.env.PORT || "3001", 10);
export const HOST = process.env.HOST || "0.0.0.0";

export const ROOM_TTL_MS = 12 * 60 * 60 * 1000;
export const DISCONNECTED_PARTICIPANT_GRACE_MS = 30 * 60 * 1000;
export const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

export const APP_NAME = "YASP";

export function getPublicConfig(): PublicConfig {
  return {
    appName: APP_NAME,
    roomTtlMs: ROOM_TTL_MS,
    disconnectedParticipantGraceMs: DISCONNECTED_PARTICIPANT_GRACE_MS,
    defaultSettings: DEFAULT_ROOM_SETTINGS,
    defaultDecks: Object.values(DEFAULT_DECKS),
  };
}
