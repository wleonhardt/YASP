import type { PublicRoomState, PublicParticipant } from "@yasp/shared";

export type RoomPhase = "waiting" | "voting" | "revealed";

export type RoundSpotlightKind = "almostConsensus" | "outlier";

export type RoundSpotlightCallout = {
  kind: RoundSpotlightKind;
  modeVote: string;
  outliers: {
    participant: PublicParticipant;
    vote: string;
  }[];
};

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

export function getLastWaitingVoter(state: PublicRoomState): PublicParticipant | null {
  if (state.revealed) {
    return null;
  }

  const connectedVoters = state.participants.filter(
    (participant) => participant.role === "voter" && participant.connected
  );
  const waitingVoters = connectedVoters.filter((participant) => !participant.hasVoted);

  if (connectedVoters.length <= 1 || waitingVoters.length !== 1) {
    return null;
  }

  return waitingVoters[0];
}

export function getOutlierCallout(state: PublicRoomState): RoundSpotlightCallout | null {
  if (
    !state.revealed ||
    !state.stats ||
    !state.votes ||
    state.stats.consensus ||
    state.stats.mostCommon === null
  ) {
    return null;
  }

  const modeIndex = state.deck.cards.indexOf(state.stats.mostCommon);

  if (modeIndex === -1) {
    return null;
  }

  const outliers = state.participants
    .filter((participant) => participant.role === "voter")
    .map((participant) => {
      const vote = state.votes?.[participant.id];

      if (vote === undefined) {
        return null;
      }

      const voteIndex = state.deck.cards.indexOf(vote);

      if (voteIndex === -1 || Math.abs(voteIndex - modeIndex) <= 2) {
        return null;
      }

      return { participant, vote };
    })
    .filter((outlier): outlier is RoundSpotlightCallout["outliers"][number] => outlier !== null);

  if (outliers.length < 1 || outliers.length > 2) {
    return null;
  }

  return {
    kind: "outlier",
    modeVote: state.stats.mostCommon,
    outliers,
  };
}

export function getAlmostConsensusCallout(state: PublicRoomState): RoundSpotlightCallout | null {
  if (
    !state.revealed ||
    !state.stats ||
    !state.votes ||
    state.stats.consensus ||
    state.stats.mostCommon === null ||
    state.stats.totalVotes < 3
  ) {
    return null;
  }

  const distributionEntries = Object.entries(state.stats.distribution).filter(([, count]) => count > 0);
  const modeCount = state.stats.distribution[state.stats.mostCommon] ?? 0;

  if (distributionEntries.length !== 2 || modeCount !== state.stats.totalVotes - 1) {
    return null;
  }

  const outliers = state.participants
    .filter((participant) => participant.role === "voter")
    .map((participant) => {
      const vote = state.votes?.[participant.id];

      if (vote === undefined || vote === state.stats?.mostCommon) {
        return null;
      }

      return { participant, vote };
    })
    .filter((outlier): outlier is RoundSpotlightCallout["outliers"][number] => outlier !== null);

  if (outliers.length !== 1) {
    return null;
  }

  return {
    kind: "almostConsensus",
    modeVote: state.stats.mostCommon,
    outliers,
  };
}

export function shouldShowInviteHero(state: PublicRoomState): boolean {
  return !state.participants.some(
    (participant) => participant.role === "voter" && participant.connected && !participant.isModerator
  );
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
