import { describe, expect, it } from "vitest";
import { DEFAULT_DECKS } from "@yasp/shared";
import {
  buildDeckInput,
  buildDeckPreview,
  createDefaultDeckDraft,
  generateCustomDeck,
  type BaseDeckType,
} from "./deckGenerators";

const BASE_DECK_TYPES: BaseDeckType[] = ["fibonacci", "modified_fibonacci", "tshirt", "powers_of_two"];

describe("deckGenerators", () => {
  it.each(BASE_DECK_TYPES)("reproduces the default %s deck exactly", (deckType) => {
    const draft = createDefaultDeckDraft(deckType);
    const preview = buildDeckPreview(draft, "preset");

    expect(preview.cards).toEqual(DEFAULT_DECKS[deckType].cards);
  });

  it("keeps question mark on and coffee off by default for every base deck", () => {
    for (const deckType of BASE_DECK_TYPES) {
      const draft = createDefaultDeckDraft(deckType);
      const preview = buildDeckPreview(draft, "preset");

      expect(preview.cards.at(-1)).toBe("?");
      expect(preview.cards).not.toContain("☕");
    }
  });

  it("caps fibonacci customization at 89", () => {
    const draft = createDefaultDeckDraft("fibonacci");
    draft.fibonacciMax = 89;

    const preview = buildDeckPreview(draft, "preset");

    expect(preview.label).toBe("Fibonacci · max 89");
    expect(preview.cards).toEqual(["0", "1", "2", "3", "5", "8", "13", "21", "34", "55", "89", "?"]);
  });

  it("caps modified fibonacci customization at 100", () => {
    const draft = createDefaultDeckDraft("modified_fibonacci");
    draft.modifiedMax = 100;

    const preview = buildDeckPreview(draft, "preset");

    expect(preview.label).toBe("Modified Fibonacci · max 100");
    expect(preview.cards).toEqual(["0", "0.5", "1", "2", "3", "5", "8", "13", "20", "40", "100", "?"]);
  });

  it("keeps custom card order while forcing ☕ before ? exactly once", () => {
    const draft = createDefaultDeckDraft("fibonacci");
    draft.customInputText = "1 2 3 ☕ ? 5";
    draft.includeCoffee = true;
    draft.includeQuestionMark = true;

    const preview = generateCustomDeck(draft);

    expect(preview.cards).toEqual(["1", "2", "3", "5", "☕", "?"]);
    expect(preview.errors).toEqual([]);
  });

  it("surfaces blocking custom validation errors for empty and duplicate cards", () => {
    const emptyDraft = createDefaultDeckDraft("fibonacci");
    const duplicateDraft = createDefaultDeckDraft("fibonacci");
    duplicateDraft.customInputText = "1, 2, 2, 5";

    expect(generateCustomDeck(emptyDraft).errors).toContain("Add at least one card.");
    expect(generateCustomDeck(duplicateDraft).errors).toContain("Remove duplicate cards: 2");
  });

  it("rejects custom cards longer than 12 characters", () => {
    const draft = createDefaultDeckDraft("fibonacci");
    draft.customInputText = "1 2 ThisIsWayTooLong";

    const result = generateCustomDeck(draft);
    expect(result.errors[0]).toMatch(/12 characters or fewer/);
  });

  it("rejects custom decks with more than 30 cards", () => {
    const draft = createDefaultDeckDraft("fibonacci");
    draft.customInputText = Array.from({ length: 31 }, (_, i) => String(i)).join(" ");
    draft.includeQuestionMark = false;
    draft.includeCoffee = false;

    const result = generateCustomDeck(draft);
    expect(result.errors).toContain("Custom decks can include at most 30 cards.");
  });

  it.each(BASE_DECK_TYPES)("buildDeckInput always returns type custom for %s", (deckType) => {
    const draft = createDefaultDeckDraft(deckType);
    const input = buildDeckInput(draft, "preset");

    expect(input.type).toBe("custom");
    expect(input).toHaveProperty("label");
    expect(input).toHaveProperty("cards");
  });
});
