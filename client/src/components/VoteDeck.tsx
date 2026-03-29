import { useId } from "react";
import type { PublicRoomState } from "@yasp/shared";
import { DeckToken } from "./DeckToken";
import { COFFEE_CARD_TOKEN, getDeckTokenAriaLabel } from "../lib/deckTokens";
import { getSelf } from "../lib/room";

type Props = {
  state: PublicRoomState;
  selectedCard: string | null;
  onVote: (value: string) => void;
  onClearVote: () => void;
  disabled?: boolean;
};

export function VoteDeck({ state, selectedCard, onVote, onClearVote, disabled }: Props) {
  const headingId = useId();
  const self = getSelf(state);
  const isVoter = self?.role === "voter";
  const canVote = isVoter && !state.revealed && !disabled;
  const voteLabel = selectedCard ? (
    <>
      <span>Your vote: </span>
      <DeckToken token={selectedCard} />
    </>
  ) : isVoter ? (
    "Choose a card"
  ) : (
    "Spectators can’t vote"
  );

  return (
    <section className="app-panel vote-deck" aria-labelledby={headingId}>
      <div className="section-header">
        <div>
          <div className="section-label">Your vote</div>
          <h2 id={headingId}>{voteLabel}</h2>
        </div>
      </div>

      <p className="vote-deck__hint">
        {isVoter
          ? selectedCard && !state.revealed
            ? "Tap the selected card again to clear it before reveal."
            : "Pick a card when you’re ready."
          : "Spectators can watch progress without taking part in the round."}
      </p>

      <div className="vote-deck__grid">
        {state.deck.cards.map((card) => {
          const isSelected = selectedCard === card;
          return (
            <button
              key={card}
              type="button"
              disabled={!canVote}
              aria-label={card === COFFEE_CARD_TOKEN ? getDeckTokenAriaLabel(card) : undefined}
              onClick={() => {
                if (isSelected) {
                  onClearVote();
                } else {
                  onVote(card);
                }
              }}
              className={["vote-card", isSelected ? "vote-card--selected" : ""].filter(Boolean).join(" ")}
              aria-pressed={isSelected}
            >
              <span className="vote-card__value">
                <DeckToken token={card} variant="card" />
              </span>
            </button>
          );
        })}
      </div>

      {isVoter && !state.revealed && (
        <div className="vote-deck__shortcut">
          Shortcuts: number keys to vote when applicable, Esc to clear
        </div>
      )}
    </section>
  );
}
