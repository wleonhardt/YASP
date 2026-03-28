import type { DeckType } from "@yasp/shared";
import type { DeckInput } from "@yasp/shared";
import { COFFEE_CARD_TOKEN, QUESTION_MARK_TOKEN } from "./deckTokens";

export type BaseDeckType = Exclude<DeckType, "custom">;
export type DeckCustomizeMode = "preset" | "custom";
export type TShirtSize = "XS" | "S" | "M" | "L" | "XL" | "XXL";

export type DeckDraft = {
  baseDeckType: BaseDeckType;
  includeQuestionMark: boolean;
  includeCoffee: boolean;
  includeZero: boolean;
  includeHalf: boolean;
  fibonacciMax: number;
  modifiedMax: number;
  powersMax: number;
  tshirtMin: TShirtSize;
  tshirtMax: TShirtSize;
  customInputText: string;
};

export type DeckPreview = {
  label: string;
  cards: string[];
  errors: string[];
};

export const FIBONACCI_MAX_OPTIONS = [13, 21, 34, 55, 89] as const;
export const MODIFIED_FIBONACCI_MAX_OPTIONS = [20, 40, 100] as const;
export const POWERS_OF_TWO_MAX_OPTIONS = [16, 32, 64, 128, 256, 512] as const;
export const TSHIRT_SIZES = ["XS", "S", "M", "L", "XL", "XXL"] as const satisfies readonly TShirtSize[];

const FIBONACCI_BASE = [0, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89] as const;
const MODIFIED_FIBONACCI_BASE = [0, 0.5, 1, 2, 3, 5, 8, 13, 20, 40, 100] as const;

function clampToOptions<T extends readonly number[]>(value: number, options: T): T[number] {
  return options.find((option) => option === value) ?? options[0];
}

function appendSpecialCards(cards: string[], includeCoffee: boolean, includeQuestionMark: boolean) {
  const withoutSpecials = cards.filter((card) => card !== COFFEE_CARD_TOKEN && card !== QUESTION_MARK_TOKEN);
  if (includeCoffee) {
    withoutSpecials.push(COFFEE_CARD_TOKEN);
  }
  if (includeQuestionMark) {
    withoutSpecials.push(QUESTION_MARK_TOKEN);
  }
  return withoutSpecials;
}

export function createDefaultDeckDraft(baseDeckType: BaseDeckType): DeckDraft {
  return {
    baseDeckType,
    includeQuestionMark: true,
    includeCoffee: false,
    includeZero: baseDeckType !== "powers_of_two" && baseDeckType !== "tshirt",
    includeHalf: baseDeckType === "modified_fibonacci",
    fibonacciMax: 21,
    modifiedMax: 100,
    powersMax: 64,
    tshirtMin: "XS",
    tshirtMax: "XXL",
    customInputText: "",
  };
}

export function generateFibonacciDeck(draft: DeckDraft): string[] {
  const max = clampToOptions(draft.fibonacciMax, FIBONACCI_MAX_OPTIONS);
  const cards = FIBONACCI_BASE.filter((value) => value <= max)
    .map(String)
    .filter((card) => draft.includeZero || card !== "0");

  return appendSpecialCards(cards, draft.includeCoffee, draft.includeQuestionMark);
}

export function generateModifiedFibonacciDeck(draft: DeckDraft): string[] {
  const max = clampToOptions(draft.modifiedMax, MODIFIED_FIBONACCI_MAX_OPTIONS);
  const cards = MODIFIED_FIBONACCI_BASE.filter((value) => value <= max)
    .map(String)
    .filter((card) => draft.includeZero || card !== "0")
    .filter((card) => draft.includeHalf || card !== "0.5");

  return appendSpecialCards(cards, draft.includeCoffee, draft.includeQuestionMark);
}

export function generatePowersOfTwoDeck(draft: DeckDraft): string[] {
  const max = clampToOptions(draft.powersMax, POWERS_OF_TWO_MAX_OPTIONS);
  const cards: string[] = [];

  if (draft.includeZero) {
    cards.push("0");
  }

  for (let current = 1; current <= max; current *= 2) {
    cards.push(String(current));
  }

  return appendSpecialCards(cards, draft.includeCoffee, draft.includeQuestionMark);
}

export function generateTShirtDeck(draft: DeckDraft): string[] {
  const startIndex = TSHIRT_SIZES.indexOf(draft.tshirtMin);
  const endIndex = TSHIRT_SIZES.indexOf(draft.tshirtMax);
  const from = Math.min(startIndex, endIndex);
  const to = Math.max(startIndex, endIndex);
  const cards = TSHIRT_SIZES.slice(from, to + 1);

  return appendSpecialCards([...cards], draft.includeCoffee, draft.includeQuestionMark);
}

export function parseCustomDeck(text: string): { cards: string[]; errors: string[] } {
  const rawTokens = text
    .split(/[,\s]+/)
    .map((token) => token.trim())
    .filter(Boolean);

  const errors: string[] = [];

  if (rawTokens.length === 0) {
    errors.push("Add at least one card.");
  }

  const seen = new Set<string>();
  const duplicateLabels = new Set<string>();
  const cards = rawTokens.filter((token) => token !== QUESTION_MARK_TOKEN && token !== COFFEE_CARD_TOKEN);

  for (const token of cards) {
    if (token.length > 12) {
      errors.push(`Card labels must be 12 characters or fewer. Problem: "${token}"`);
      break;
    }

    if (seen.has(token)) {
      duplicateLabels.add(token);
    }
    seen.add(token);
  }

  if (duplicateLabels.size > 0) {
    errors.push(`Remove duplicate cards: ${Array.from(duplicateLabels).join(", ")}`);
  }

  return { cards: rawTokens, errors };
}

export function generateCustomDeck(draft: DeckDraft): { cards: string[]; errors: string[] } {
  const parsed = parseCustomDeck(draft.customInputText);
  const cards = appendSpecialCards(parsed.cards, draft.includeCoffee, draft.includeQuestionMark);
  const errors = [...parsed.errors];

  if (cards.length > 30) {
    errors.push("Custom decks can include at most 30 cards.");
  }

  return { cards, errors };
}

export function buildDeckPreview(draft: DeckDraft, mode: DeckCustomizeMode): DeckPreview {
  if (mode === "custom") {
    const custom = generateCustomDeck(draft);
    return {
      label: "Custom",
      cards: custom.cards,
      errors: custom.errors,
    };
  }

  switch (draft.baseDeckType) {
    case "fibonacci":
      return {
        label: `Fibonacci · max ${clampToOptions(draft.fibonacciMax, FIBONACCI_MAX_OPTIONS)}`,
        cards: generateFibonacciDeck(draft),
        errors: [],
      };
    case "modified_fibonacci":
      return {
        label: `Modified Fibonacci · max ${clampToOptions(
          draft.modifiedMax,
          MODIFIED_FIBONACCI_MAX_OPTIONS
        )}`,
        cards: generateModifiedFibonacciDeck(draft),
        errors: [],
      };
    case "powers_of_two":
      return {
        label: `Powers of Two · max ${clampToOptions(draft.powersMax, POWERS_OF_TWO_MAX_OPTIONS)}`,
        cards: generatePowersOfTwoDeck(draft),
        errors: [],
      };
    case "tshirt": {
      const startIndex = TSHIRT_SIZES.indexOf(draft.tshirtMin);
      const endIndex = TSHIRT_SIZES.indexOf(draft.tshirtMax);
      const from = Math.min(startIndex, endIndex);
      const to = Math.max(startIndex, endIndex);
      const rangeLabel = from === to ? TSHIRT_SIZES[from] : `${TSHIRT_SIZES[from]}–${TSHIRT_SIZES[to]}`;

      return {
        label: `T-Shirt · ${rangeLabel}`,
        cards: generateTShirtDeck(draft),
        errors: [],
      };
    }
  }
}

export function buildDeckInput(draft: DeckDraft, mode: DeckCustomizeMode): DeckInput {
  const preview = buildDeckPreview(draft, mode);
  return {
    type: "custom",
    label: preview.label,
    cards: preview.cards,
  };
}
