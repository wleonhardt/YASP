import type { PublicRoomState } from "@yasp/shared";

type Props = {
  state: PublicRoomState;
};

export function RoomHeader({ state }: Props) {
  const voterCount = state.participants.filter(
    (p) => p.role === "voter" && p.connected
  ).length;
  const votedCount = state.participants.filter(
    (p) => p.role === "voter" && p.connected && p.hasVoted
  ).length;

  return (
    <div style={{ textAlign: "center", marginBottom: 8 }}>
      <h2 style={{ fontSize: 20, fontWeight: 600 }}>
        Round {state.roundNumber}
      </h2>
      <p
        style={{
          fontSize: 14,
          color: "var(--color-text-muted)",
        }}
      >
        {state.deck.label} &middot;{" "}
        {state.revealed
          ? "Votes revealed"
          : `${votedCount} / ${voterCount} voted`}
      </p>
    </div>
  );
}
