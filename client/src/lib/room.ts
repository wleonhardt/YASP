import type { PublicRoomState, PublicParticipant } from "@yasp/shared";

export type RoomPhase = "waiting" | "voting" | "revealed";

export function getSelf(state: PublicRoomState): PublicParticipant | undefined {
  return state.participants.find((p) => p.isSelf);
}

export function isMeModerator(state: PublicRoomState): boolean {
  const self = getSelf(state);
  return self?.isModerator ?? false;
}

export function getConnectedVoterCounts(state: PublicRoomState) {
  const connectedVoters = state.participants.filter(
    (participant) => participant.role === "voter" && participant.connected
  );
  const votedVoters = connectedVoters.filter((participant) => participant.hasVoted);

  return {
    total: connectedVoters.length,
    voted: votedVoters.length,
    percent: connectedVoters.length === 0 ? 0 : (votedVoters.length / connectedVoters.length) * 100,
  };
}

export function getRoomPhase(state: PublicRoomState): RoomPhase {
  if (state.revealed) {
    return "revealed";
  }

  const { voted } = getConnectedVoterCounts(state);
  return voted > 0 ? "voting" : "waiting";
}

export function getParticipantInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);

  if (parts.length === 0) {
    return "?";
  }

  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("");
}

export function getRevealedVote(state: PublicRoomState, participantId: string) {
  return state.votes?.[participantId];
}

export function getNumericVotes(state: PublicRoomState): number[] {
  if (!state.votes) {
    return [];
  }

  return Object.values(state.votes)
    .map((value) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) && String(parsed) === value ? parsed : null;
    })
    .filter((value): value is number => value !== null);
}

export function getMedian(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }

  return sorted[middle];
}

export function getSpread(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  return Math.max(...values) - Math.min(...values);
}
