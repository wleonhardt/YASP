import type { SessionId, PublicRoomState, PublicParticipant, VoteValue, ParticipantId } from "@yasp/shared";
import type { Room } from "../domain/types.js";
import { computeStats } from "../domain/stats.js";
import { getRemainingSeconds } from "../domain/timer.js";
import { now } from "../utils/time.js";

export function serializeRoom(room: Room, selfSessionId: SessionId): PublicRoomState {
  const sortedParticipants = Array.from(room.participants.values()).sort((a, b) => {
    if (a.joinedAt !== b.joinedAt) return a.joinedAt - b.joinedAt;
    return a.name.localeCompare(b.name);
  });

  const selfParticipant = sortedParticipants.find((p) => p.sessionId === selfSessionId);

  const participants: PublicParticipant[] = sortedParticipants.map((p) => ({
    id: p.id,
    name: p.name,
    role: p.role,
    connected: p.connected,
    hasVoted: room.votes.has(p.id),
    isSelf: p.sessionId === selfSessionId,
    isModerator: p.id === room.moderatorId,
  }));

  let votes: Record<ParticipantId, VoteValue> | null = null;
  if (room.revealed) {
    votes = {};
    for (const [pid, val] of room.votes) {
      votes[pid] = val;
    }
  }

  const stats = room.revealed ? computeStats(room.votes, room.deck.cards) : null;
  const currentTime = now();

  return {
    id: room.id,
    title: room.title,
    roundNumber: room.roundNumber,
    revealed: room.revealed,
    deck: room.deck,
    settings: room.settings,
    timer: {
      ...room.timer,
      remainingSeconds: getRemainingSeconds(room.timer, currentTime),
    },
    participants,
    votes,
    stats,
    sessionRounds: room.sessionRounds,
    me: {
      participantId: selfParticipant?.id ?? null,
      sessionId: selfSessionId,
      connected: selfParticipant?.connected ?? false,
      ownVote: selfParticipant ? (room.votes.get(selfParticipant.id) ?? null) : null,
    },
  };
}
