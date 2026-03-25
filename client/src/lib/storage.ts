import type { ParticipantRole } from "@yasp/shared";

const SESSION_KEY = "yasp.sessionId";
const NAME_KEY = "yasp.displayName";
const ROLE_KEY = "yasp.role";

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
function safeGetItem(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSetItem(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage full or unavailable — silently ignore
  }
}

export function getSessionId(): string {
  let id = safeGetItem(SESSION_KEY);
  if (!id) {
    id = generateSessionId();
    safeSetItem(SESSION_KEY, id);
  }
  return id;
}

export function getStoredDisplayName(): string {
  return safeGetItem(NAME_KEY) || "";
}

export function setStoredDisplayName(name: string): void {
  safeSetItem(NAME_KEY, name);
}

export function getStoredRole(): ParticipantRole | null {
  const v = safeGetItem(ROLE_KEY);
  if (v === "voter" || v === "spectator") return v;
  return null;
}

export function setStoredRole(role: ParticipantRole): void {
  safeSetItem(ROLE_KEY, role);
}
