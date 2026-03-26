import type { Room, Participant } from "./types.js";
import type { PermissionPolicy } from "@yasp/shared";

export function isModerator(room: Room, participantId: string): boolean {
  return room.moderatorId === participantId;
}

export function checkPolicy(
  room: Room,
  participantId: string,
  policy: PermissionPolicy
): boolean {
  if (policy === "anyone") return true;
  return isModerator(room, participantId);
}

export function canReveal(room: Room, participantId: string): boolean {
  return checkPolicy(room, participantId, room.settings.revealPolicy);
}

export function canReset(room: Room, participantId: string): boolean {
  return checkPolicy(room, participantId, room.settings.resetPolicy);
}

export function canNextRound(room: Room, participantId: string): boolean {
  // next round follows the same rule as reset in v1
  return checkPolicy(room, participantId, room.settings.resetPolicy);
}

export function canChangeDeck(room: Room, participantId: string): boolean {
  return checkPolicy(room, participantId, room.settings.deckChangePolicy);
}

export function canUpdateSettings(room: Room, participantId: string): boolean {
  // moderator-only in v1
  return isModerator(room, participantId);
}

export function canTransferModerator(room: Room, participantId: string): boolean {
  return isModerator(room, participantId);
}

export function canChangeName(room: Room): boolean {
  return room.settings.allowNameChange;
}

export function canChangeRole(room: Room): boolean {
  return room.settings.allowSelfRoleSwitch;
}

export function canBeSpectator(room: Room): boolean {
  return room.settings.allowSpectators;
}
