import type { Room, Participant } from "./types.js";

/**
 * Find the next moderator candidate by joinedAt.
 * Prefers connected participants; falls back to any remaining.
 */
export function findNextModerator(room: Room, excludeId?: string): Participant | null {
  const all = Array.from(room.participants.values())
    .filter((p) => p.id !== excludeId)
    .sort((a, b) => a.joinedAt - b.joinedAt || a.name.localeCompare(b.name));

  const connected = all.find((p) => p.connected);
  if (connected) return connected;

  return all[0] ?? null;
}

/**
 * Reassign moderator if the current one is gone.
 */
export function reassignModeratorIfNeeded(room: Room): void {
  if (room.moderatorId && room.participants.has(room.moderatorId)) {
    return;
  }
  const next = findNextModerator(room);
  room.moderatorId = next?.id ?? null;
}

/**
 * Check if any participant is connected.
 */
export function hasConnectedParticipants(room: Room): boolean {
  for (const p of room.participants.values()) {
    if (p.connected) return true;
  }
  return false;
}
