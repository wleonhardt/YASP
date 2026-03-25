import type { PublicRoomState } from "@yasp/shared";
import { isMeModerator } from "../lib/room";

type Props = {
  state: PublicRoomState;
  onReveal: () => void;
  onReset: () => void;
  onNextRound: () => void;
  disabled?: boolean;
};

export function RoomControls({ state, onReveal, onReset, onNextRound, disabled }: Props) {
  const isMod = isMeModerator(state);
  const revealAllowed =
    !disabled && (state.settings.revealPolicy === "anyone" || isMod);
  const resetAllowed =
    !disabled && (state.settings.resetPolicy === "anyone" || isMod);

  return (
    <div
      style={{
        display: "flex",
        gap: 8,
        justifyContent: "center",
        padding: "12px 0",
      }}
    >
      {!state.revealed ? (
        <button
          onClick={onReveal}
          disabled={!revealAllowed}
          style={{
            padding: "8px 20px",
            borderRadius: "var(--radius)",
            background: revealAllowed
              ? "var(--color-primary)"
              : "var(--color-surface)",
            color: revealAllowed ? "#fff" : "var(--color-text-muted)",
            fontWeight: 600,
            cursor: revealAllowed ? "pointer" : "not-allowed",
          }}
        >
          Reveal Votes
        </button>
      ) : (
        <>
          <button
            onClick={onReset}
            disabled={!resetAllowed}
            style={{
              padding: "8px 20px",
              borderRadius: "var(--radius)",
              background: resetAllowed
                ? "var(--color-surface)"
                : "var(--color-surface)",
              border: "1px solid var(--color-border)",
              color: resetAllowed ? "var(--color-text)" : "var(--color-text-muted)",
              fontWeight: 600,
              cursor: resetAllowed ? "pointer" : "not-allowed",
            }}
          >
            Reset Round
          </button>
          <button
            onClick={onNextRound}
            disabled={!resetAllowed}
            style={{
              padding: "8px 20px",
              borderRadius: "var(--radius)",
              background: resetAllowed
                ? "var(--color-primary)"
                : "var(--color-surface)",
              color: resetAllowed ? "#fff" : "var(--color-text-muted)",
              fontWeight: 600,
              cursor: resetAllowed ? "pointer" : "not-allowed",
            }}
          >
            Next Round
          </button>
        </>
      )}
    </div>
  );
}
