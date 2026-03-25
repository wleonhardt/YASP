import type { PublicRoomState, PublicParticipant } from "@yasp/shared";

type Props = {
  state: PublicRoomState;
};

function ParticipantCard({
  participant,
  vote,
  revealed,
}: {
  participant: PublicParticipant;
  vote: string | undefined;
  revealed: boolean;
}) {
  const showVote = revealed && vote !== undefined;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 4,
        padding: 12,
        borderRadius: "var(--radius)",
        background: "var(--color-surface)",
        border: participant.isSelf
          ? "2px solid var(--color-primary)"
          : "1px solid var(--color-border)",
        minWidth: 80,
        opacity: participant.connected ? 1 : 0.5,
      }}
    >
      {/* Vote card */}
      <div
        style={{
          width: 48,
          height: 64,
          borderRadius: 6,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: showVote && vote.length > 3 ? 12 : 16,
          fontWeight: 700,
          background: showVote
            ? "var(--color-primary)"
            : participant.hasVoted
              ? "var(--color-voted)"
              : "var(--color-border)",
          color: showVote || participant.hasVoted ? "#fff" : "var(--color-text-muted)",
          border: "1px solid var(--color-border)",
        }}
      >
        {showVote ? vote : participant.hasVoted ? "?" : ""}
      </div>
      {/* Name */}
      <span
        style={{
          fontSize: 13,
          fontWeight: participant.isSelf ? 600 : 400,
          maxWidth: 80,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          textAlign: "center",
        }}
      >
        {participant.name}
      </span>
      {/* Badges */}
      <div style={{ display: "flex", gap: 4, fontSize: 10 }}>
        {participant.isModerator && (
          <span
            style={{
              background: "var(--color-moderator)",
              color: "#000",
              padding: "1px 6px",
              borderRadius: 10,
              fontWeight: 600,
            }}
          >
            Mod
          </span>
        )}
        {participant.role === "spectator" && (
          <span
            style={{
              background: "var(--color-text-muted)",
              color: "#000",
              padding: "1px 6px",
              borderRadius: 10,
            }}
          >
            Spectator
          </span>
        )}
        {!participant.connected && (
          <span
            style={{
              background: "var(--color-danger)",
              color: "#fff",
              padding: "1px 6px",
              borderRadius: 10,
            }}
          >
            Offline
          </span>
        )}
      </div>
    </div>
  );
}

export function ParticipantGrid({ state }: Props) {
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 12,
        justifyContent: "center",
        padding: "16px 0",
      }}
    >
      {state.participants.map((p) => (
        <ParticipantCard
          key={p.id}
          participant={p}
          vote={state.votes?.[p.id]}
          revealed={state.revealed}
        />
      ))}
    </div>
  );
}
