import { describe, expect, it } from "vitest";
import { DEFAULT_DECKS } from "@yasp/shared";
import { computeStats } from "../domain/stats.js";

const fibonacciDeck = DEFAULT_DECKS.fibonacci.cards;
const modifiedFibonacciDeck = DEFAULT_DECKS.modified_fibonacci.cards;
const powersDeck = DEFAULT_DECKS.powers_of_two.cards;

describe("computeStats", () => {
  it("returns empty stats for no votes", () => {
    const stats = computeStats(new Map(), fibonacciDeck);
    expect(stats).toEqual({
      totalVotes: 0,
      numericAverage: null,
      distribution: {},
      consensus: false,
      mostCommon: null,
    });
  });

  it("computes stats for numeric votes", () => {
    const votes = new Map([
      ["a", "3"],
      ["b", "5"],
      ["c", "5"],
    ]);
    const stats = computeStats(votes, fibonacciDeck);
    expect(stats.totalVotes).toBe(3);
    expect(stats.numericAverage).toBe(5);
    expect(stats.distribution).toEqual({ "3": 1, "5": 2 });
    expect(stats.consensus).toBe(false);
    expect(stats.mostCommon).toBe("5");
  });

  it("rounds to the nearest valid fibonacci card", () => {
    const stats = computeStats(
      new Map([
        ["a", "8"],
        ["b", "13"],
      ]),
      fibonacciDeck
    );

    expect(stats.numericAverage).toBe(13);
  });

  it("rounds to the nearest valid modified fibonacci card", () => {
    const stats = computeStats(
      new Map([
        ["a", "13"],
        ["b", "20"],
      ]),
      modifiedFibonacciDeck
    );

    expect(stats.numericAverage).toBe(20);
  });

  it("rounds to the nearest valid powers-of-two card", () => {
    const stats = computeStats(
      new Map([
        ["a", "16"],
        ["b", "32"],
      ]),
      powersDeck
    );

    expect(stats.numericAverage).toBe(32);
  });

  it("breaks exact ties upward", () => {
    const stats = computeStats(
      new Map([
        ["a", "1"],
        ["b", "2"],
      ]),
      fibonacciDeck
    );

    expect(stats.numericAverage).toBe(2);
  });

  it("identifies consensus", () => {
    const stats = computeStats(
      new Map([
        ["a", "8"],
        ["b", "8"],
      ]),
      fibonacciDeck
    );
    expect(stats.consensus).toBe(true);
    expect(stats.mostCommon).toBe("8");
  });

  it("returns null mostCommon on tie", () => {
    const stats = computeStats(
      new Map([
        ["a", "3"],
        ["b", "5"],
      ]),
      fibonacciDeck
    );
    expect(stats.mostCommon).toBeNull();
  });

  it("handles mixed numeric and non-numeric votes", () => {
    const votes = new Map([
      ["a", "5"],
      ["b", "?"],
      ["c", "coffee"],
    ]);
    const stats = computeStats(votes, ["5", "?", "coffee"]);
    expect(stats.totalVotes).toBe(3);
    expect(stats.numericAverage).toBe(5);
    expect(stats.distribution).toEqual({ "5": 1, "?": 1, coffee: 1 });
  });

  it("returns null for all non-numeric votes", () => {
    const stats = computeStats(
      new Map([
        ["a", "?"],
        ["b", "coffee"],
      ]),
      ["?", "coffee"]
    );
    expect(stats.numericAverage).toBeNull();
  });

  it("supports decimal deck values when present in the deck", () => {
    const stats = computeStats(
      new Map([
        ["a", "0.5"],
        ["b", "0.5"],
      ]),
      modifiedFibonacciDeck
    );
    expect(stats.numericAverage).toBe(0.5);
    expect(stats.consensus).toBe(true);
  });

  it("treats single vote as consensus", () => {
    const stats = computeStats(new Map([["a", "13"]]), fibonacciDeck);
    expect(stats.consensus).toBe(true);
    expect(stats.mostCommon).toBe("13");
  });

  it("treats '01' as non-numeric (distinct from '1')", () => {
    const stats = computeStats(
      new Map([
        ["a", "01"],
        ["b", "1"],
      ]),
      ["01", "1"]
    );
    expect(stats.numericAverage).toBe(1);
    expect(stats.totalVotes).toBe(2);
    expect(stats.distribution).toEqual({ "01": 1, "1": 1 });
    expect(stats.consensus).toBe(false);
  });

  it("'01' and '1' are distinct in distribution", () => {
    const stats = computeStats(
      new Map([
        ["a", "01"],
        ["b", "01"],
        ["c", "1"],
      ]),
      ["01", "1"]
    );
    expect(stats.distribution["01"]).toBe(2);
    expect(stats.distribution["1"]).toBe(1);
    expect(stats.numericAverage).toBe(1);
    expect(stats.mostCommon).toBe("01");
  });

  it("does not treat leading whitespace labels as numeric", () => {
    const stats = computeStats(new Map([["a", " 5"]]), [" 5", "5"]);
    expect(stats.numericAverage).toBeNull();
  });

  it("treats '0' as numeric", () => {
    const stats = computeStats(new Map([["a", "0"]]), fibonacciDeck);
    expect(stats.numericAverage).toBe(0);
  });

  it("averages only numeric votes before rounding to deck values", () => {
    const stats = computeStats(
      new Map([
        ["a", "1"],
        ["b", "2"],
        ["c", "?"],
        ["d", "coffee"],
      ]),
      fibonacciDeck
    );

    expect(stats.numericAverage).toBe(2);
    expect(stats.totalVotes).toBe(4);
  });
});
