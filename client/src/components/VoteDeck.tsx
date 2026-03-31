import { useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import type { PublicRoomState } from "@yasp/shared";
import { DeckToken } from "./DeckToken";
import { COFFEE_CARD_TOKEN } from "../lib/deckTokens";
import { getSelf } from "../lib/room";

type Props = {
  state: PublicRoomState;
  selectedCard: string | null;
  onVote: (value: string) => void;
  onClearVote: () => void;
  disabled?: boolean;
};

const HIDE_SHORTCUTS_QUERY = "(hover: none), (pointer: coarse), (max-width: 720px)";

export function VoteDeck({ state, selectedCard, onVote, onClearVote, disabled }: Props) {
  const { t } = useTranslation();
  const headingId = useId();
  const self = getSelf(state);
  const isVoter = self?.role === "voter";
  const canVote = isVoter && !state.revealed && !disabled;
  const [showShortcutHint, setShowShortcutHint] = useState(() =>
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? !window.matchMedia(HIDE_SHORTCUTS_QUERY).matches
      : true
  );

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }

    const mediaQuery = window.matchMedia(HIDE_SHORTCUTS_QUERY);
    const syncShortcutHint = () => setShowShortcutHint(!mediaQuery.matches);
    syncShortcutHint();
    mediaQuery.addEventListener("change", syncShortcutHint);

    return () => mediaQuery.removeEventListener("change", syncShortcutHint);
  }, []);

  const voteLabel = selectedCard ? (
    <>
      <span>{t("room.yourVote")}: </span>
      <DeckToken token={selectedCard} />
    </>
  ) : isVoter ? (
    t("room.chooseCard")
  ) : (
    t("room.spectatorsCantVote")
  );

  return (
    <section className="app-panel vote-deck" aria-labelledby={headingId}>
      <div className="section-header">
        <div>
          <div className="section-label">{t("room.yourVote")}</div>
          <h2 id={headingId}>{voteLabel}</h2>
        </div>
      </div>

      <p className="vote-deck__hint">
        {isVoter
          ? selectedCard && !state.revealed
            ? t("room.voteHintReady")
            : t("room.voteHintIdle")
          : t("room.voteHintSpectator")}
      </p>

      <div className="vote-deck__grid">
        {state.deck.cards.map((card) => {
          const isSelected = selectedCard === card;
          return (
            <button
              key={card}
              type="button"
              disabled={!canVote}
              aria-label={card === COFFEE_CARD_TOKEN ? t("deck.coffeeBreak") : undefined}
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

      {isVoter && !state.revealed && showShortcutHint ? (
        <div className="vote-deck__shortcut">{t("room.shortcuts")}</div>
      ) : null}
    </section>
  );
}
