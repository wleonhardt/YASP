import type { Room, Participant } from "./types.js";
import type { ParticipantId, SessionId } from "@yasp/shared";

export function findParticipantBySessionId(room: Room, sessionId: SessionId): Participant | null {
  return room.participants.get(sessionId) ?? null;
}

export function findParticipantByPublicId(room: Room, participantId: ParticipantId): Participant | null {
  for (const participant of room.participants.values()) {
    if (participant.id === participantId) {
      return participant;
    }
  }

  return null;
}

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
  if (room.moderatorId && findParticipantByPublicId(room, room.moderatorId)) {
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
