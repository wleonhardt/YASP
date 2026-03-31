import type { ParticipantRole } from "@yasp/shared";

const SESSION_KEY = "yasp.sessionId";
const NAME_KEY = "yasp.displayName";
const ROLE_KEY = "yasp.role";
const TIMER_SOUND_KEY = "yasp.timerSoundEnabled";

type StorageLike = Pick<Storage, "getItem" | "setItem">;

/**
 * Generate a UUID v4 session ID.
 * crypto.randomUUID() is only available in secure contexts (https or localhost).
 * For plain HTTP on LAN IPs, fall back to a manual v4 UUID via crypto.getRandomValues().
 */
function generateSessionId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback: manual UUID v4 using crypto.getRandomValues (available in all modern browsers)
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 1
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Safe localStorage wrapper — returns null if storage is unavailable (private browsing, etc.) */
function getStorage(): StorageLike | null {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage;
}

export function safeGetStoredValue(key: string): string | null {
  try {
    return getStorage()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function safeSetStoredValue(key: string, value: string): void {
  try {
    getStorage()?.setItem(key, value);
  } catch {
    // Storage full or unavailable — silently ignore
  }
}

export function getSessionId(): string {
  let id = safeGetStoredValue(SESSION_KEY);
  if (!id) {
    id = generateSessionId();
    safeSetStoredValue(SESSION_KEY, id);
  }
  return id;
}

export function getStoredDisplayName(): string {
  return safeGetStoredValue(NAME_KEY) || "";
}

export function setStoredDisplayName(name: string): void {
  safeSetStoredValue(NAME_KEY, name);
}

export function getStoredRole(): ParticipantRole | null {
  const v = safeGetStoredValue(ROLE_KEY);
  if (v === "voter" || v === "spectator") return v;
  return null;
}

export function setStoredRole(role: ParticipantRole): void {
  safeSetStoredValue(ROLE_KEY, role);
}

export function getStoredTimerSoundEnabled(): boolean {
  const value = safeGetStoredValue(TIMER_SOUND_KEY);
  if (value === "0") {
    return false;
  }
  if (value === "1") {
    return true;
  }
  return true;
}

export function setStoredTimerSoundEnabled(enabled: boolean): void {
  safeSetStoredValue(TIMER_SOUND_KEY, enabled ? "1" : "0");
}
