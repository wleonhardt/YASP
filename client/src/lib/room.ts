import type { PublicRoomState, PublicParticipant } from "@yasp/shared";

export function getSelf(state: PublicRoomState): PublicParticipant | undefined {
  return state.participants.find((p) => p.isSelf);
}

export function isMeVoter(state: PublicRoomState): boolean {
  const self = getSelf(state);
  return self?.role === "voter";
}

export function isMeModerator(state: PublicRoomState): boolean {
  const self = getSelf(state);
  return self?.isModerator ?? false;
}
