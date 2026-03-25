import { DEFAULT_DECKS } from "@yasp/shared";
import type { Deck } from "@yasp/shared";
import type { DeckInput } from "@yasp/shared";

export function resolveDeck(input?: DeckInput): Deck {
  if (!input) {
    return DEFAULT_DECKS.fibonacci;
  }
  if (input.type !== "custom") {
    return DEFAULT_DECKS[input.type];
  }
  return {
    type: "custom",
    label: input.label,
    cards: input.cards,
  };
}
