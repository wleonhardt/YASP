import type { PublicRoomState } from "@yasp/shared";
import { getSelf } from "../lib/room";

type Props = {
  state: PublicRoomState;
  selectedCard: string | null;
  onVote: (value: string) => void;
  onClearVote: () => void;
  disabled?: boolean;
};

export function VoteDeck({ state, selectedCard, onVote, onClearVote, disabled }: Props) {
  const self = getSelf(state);
  const isVoter = self?.role === "voter";
  const canVote = isVoter && !state.revealed && !disabled;

  return (
    <div style={{ marginTop: 24 }}>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          justifyContent: "center",
        }}
      >
        {state.deck.cards.map((card) => {
          const isSelected = selectedCard === card;
          return (
            <button
              key={card}
              disabled={!canVote}
              onClick={() => {
                if (isSelected) {
                  onClearVote();
                } else {
                  onVote(card);
                }
              }}
              style={{
                width: 64,
                height: 88,
                borderRadius: "var(--radius)",
                border: isSelected
                  ? "2px solid var(--color-primary)"
                  : "2px solid var(--color-border)",
                background: isSelected
                  ? "var(--color-card-selected)"
                  : "var(--color-card)",
                color: "var(--color-text)",
                fontSize: card.length > 3 ? 14 : 18,
                fontWeight: 600,
                cursor: canVote ? "pointer" : "default",
                opacity: canVote ? 1 : 0.5,
                transition: "all 0.15s",
              }}
              onMouseEnter={(e) => {
                if (canVote && !isSelected) {
                  (e.target as HTMLButtonElement).style.background =
                    "var(--color-card-hover)";
                }
              }}
              onMouseLeave={(e) => {
                if (!isSelected) {
                  (e.target as HTMLButtonElement).style.background =
                    "var(--color-card)";
                }
              }}
            >
              {card}
            </button>
          );
        })}
      </div>
      {!isVoter && (
        <p
          style={{
            textAlign: "center",
            color: "var(--color-text-muted)",
            marginTop: 8,
            fontSize: 14,
          }}
        >
          Spectators cannot vote
        </p>
      )}
    </div>
  );
}
