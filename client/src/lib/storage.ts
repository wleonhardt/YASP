import type { ParticipantRole } from "@yasp/shared";

const SESSION_KEY = "yasp.sessionId";
const NAME_KEY = "yasp.displayName";
const ROLE_KEY = "yasp.role";

function generateSessionId(): string {
  return crypto.randomUUID();
}

export function getSessionId(): string {
  let id = localStorage.getItem(SESSION_KEY);
  if (!id) {
    id = generateSessionId();
    localStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

export function getStoredDisplayName(): string {
  return localStorage.getItem(NAME_KEY) || "";
}

export function setStoredDisplayName(name: string): void {
  localStorage.setItem(NAME_KEY, name);
}

export function getStoredRole(): ParticipantRole | null {
  const v = localStorage.getItem(ROLE_KEY);
  if (v === "voter" || v === "spectator") return v;
  return null;
}

export function setStoredRole(role: ParticipantRole): void {
  localStorage.setItem(ROLE_KEY, role);
}
