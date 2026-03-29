import type { Deck, DeckType } from "@yasp/shared";
import type { TFunction } from "i18next";
import type { BaseDeckType, DeckTextSet, TShirtSize } from "../lib/deckGenerators";

export function getBaseDeckLabel(t: TFunction, type: BaseDeckType): string {
  switch (type) {
    case "fibonacci":
      return t("deck.options.fibonacci");
    case "modified_fibonacci":
      return t("deck.options.modifiedFibonacci");
    case "powers_of_two":
      return t("deck.options.powersOfTwo");
    case "tshirt":
      return t("deck.options.tshirt");
  }
}

export function getDeckLabel(t: TFunction, deck: Pick<Deck, "type" | "label">): string {
  if (deck.type === "custom") {
    return deck.label;
  }

  return getBaseDeckLabel(t, deck.type);
}

export function createDeckTextSet(t: TFunction): DeckTextSet {
  return {
    labels: {
      custom: t("deck.options.custom"),
      fibonacci: (max) => t("deck.preview.fibonacci", { max }),
      modifiedFibonacci: (max) => t("deck.preview.modifiedFibonacci", { max }),
      powersOfTwo: (max) => t("deck.preview.powersOfTwo", { max }),
      tshirt: (from: TShirtSize, to: TShirtSize) =>
        t("deck.preview.tshirt", {
          range: from === to ? from : `${from}–${to}`,
        }),
    },
    errors: {
      addAtLeastOneCard: t("deck.errors.addAtLeastOneCard"),
      maxLabelLength: (token) => t("deck.errors.maxLabelLength", { token }),
      duplicateCards: (cards) => t("deck.errors.duplicateCards", { cards: cards.join(", ") }),
      maxCards: t("deck.errors.maxCards"),
    },
  };
}

export function getDeckTypeOptions(): readonly Exclude<DeckType, "custom">[] {
  return ["fibonacci", "modified_fibonacci", "tshirt", "powers_of_two"] as const;
}
