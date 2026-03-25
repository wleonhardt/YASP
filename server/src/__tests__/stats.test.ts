import { describe, it, expect } from "vitest";
import { computeStats } from "../domain/stats.js";

describe("computeStats", () => {
  it("returns empty stats for no votes", () => {
    const stats = computeStats(new Map());
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
    const stats = computeStats(votes);
    expect(stats.totalVotes).toBe(3);
    expect(stats.numericAverage).toBeCloseTo(4.333, 2);
    expect(stats.distribution).toEqual({ "3": 1, "5": 2 });
    expect(stats.consensus).toBe(false);
    expect(stats.mostCommon).toBe("5");
  });

  it("identifies consensus", () => {
    const votes = new Map([
      ["a", "8"],
      ["b", "8"],
    ]);
    const stats = computeStats(votes);
    expect(stats.consensus).toBe(true);
    expect(stats.mostCommon).toBe("8");
  });

  it("returns null mostCommon on tie", () => {
    const votes = new Map([
      ["a", "3"],
      ["b", "5"],
    ]);
    const stats = computeStats(votes);
    expect(stats.mostCommon).toBeNull();
  });

  it("handles mixed numeric and non-numeric", () => {
    const votes = new Map([
      ["a", "5"],
      ["b", "?"],
      ["c", "coffee"],
    ]);
    const stats = computeStats(votes);
    expect(stats.totalVotes).toBe(3);
    expect(stats.numericAverage).toBe(5);
    expect(stats.distribution).toEqual({ "5": 1, "?": 1, "coffee": 1 });
  });

  it("handles all non-numeric", () => {
    const votes = new Map([
      ["a", "?"],
      ["b", "coffee"],
    ]);
    const stats = computeStats(votes);
    expect(stats.numericAverage).toBeNull();
  });

  it("handles decimal numeric values", () => {
    const votes = new Map([
      ["a", "0.5"],
      ["b", "0.5"],
    ]);
    const stats = computeStats(votes);
    expect(stats.numericAverage).toBe(0.5);
    expect(stats.consensus).toBe(true);
  });

  it("treats single vote as consensus", () => {
    const votes = new Map([["a", "13"]]);
    const stats = computeStats(votes);
    expect(stats.consensus).toBe(true);
    expect(stats.mostCommon).toBe("13");
  });

  it("treats '01' as non-numeric (distinct from '1')", () => {
    const votes = new Map([
      ["a", "01"],
      ["b", "1"],
    ]);
    const stats = computeStats(votes);
    // "01" is not a plain numeric string because String(Number("01")) === "1" !== "01"
    // Only "1" counts as numeric
    expect(stats.numericAverage).toBe(1);
    expect(stats.totalVotes).toBe(2);
    expect(stats.distribution).toEqual({ "01": 1, "1": 1 });
    expect(stats.consensus).toBe(false);
  });

  it("'01' and '1' are distinct in distribution", () => {
    const votes = new Map([
      ["a", "01"],
      ["b", "01"],
      ["c", "1"],
    ]);
    const stats = computeStats(votes);
    expect(stats.distribution["01"]).toBe(2);
    expect(stats.distribution["1"]).toBe(1);
    // "01" is non-numeric, only "1" is numeric
    expect(stats.numericAverage).toBe(1);
    expect(stats.mostCommon).toBe("01");
  });

  it("does not treat leading/trailing whitespace labels as numeric", () => {
    // After deck normalization, labels should be trimmed,
    // but test the stats function directly with edge cases
    const votes = new Map([["a", " 5"]]);
    const stats = computeStats(votes);
    // " 5" !== String(Number(" 5")) which is "5", so non-numeric
    expect(stats.numericAverage).toBeNull();
  });

  it("treats '0' as numeric", () => {
    const votes = new Map([["a", "0"]]);
    const stats = computeStats(votes);
    expect(stats.numericAverage).toBe(0);
  });
});
