import type { RevealStats, VoteValue } from "@yasp/shared";

export function computeStats(votes: Map<string, VoteValue>): RevealStats {
  const values = Array.from(votes.values());
  const totalVotes = values.length;

  if (totalVotes === 0) {
    return {
      totalVotes: 0,
      numericAverage: null,
      distribution: {},
      consensus: false,
      mostCommon: null,
    };
  }

  // Distribution
  const distribution: Record<string, number> = {};
  for (const v of values) {
    distribution[v] = (distribution[v] || 0) + 1;
  }

  // Numeric average — only plain numeric strings per spec.
  // A label is numeric only if Number(v) is finite AND String(Number(v)) === v,
  // ensuring "01", "1e2", " 3" etc. are not treated as numeric.
  const numericValues: number[] = [];
  for (const v of values) {
    const n = Number(v);
    if (Number.isFinite(n) && String(n) === v) {
      numericValues.push(n);
    }
  }
  const numericAverage =
    numericValues.length > 0
      ? numericValues.reduce((a, b) => a + b, 0) / numericValues.length
      : null;

  // Consensus: all votes identical and at least one vote
  const consensus = totalVotes > 0 && new Set(values).size === 1;

  // Most common: single winner mode
  let mostCommon: string | null = null;
  let maxCount = 0;
  let tieAtMax = false;
  for (const [label, count] of Object.entries(distribution)) {
    if (count > maxCount) {
      maxCount = count;
      mostCommon = label;
      tieAtMax = false;
    } else if (count === maxCount) {
      tieAtMax = true;
    }
  }
  if (tieAtMax) {
    mostCommon = null;
  }

  return {
    totalVotes,
    numericAverage,
    distribution,
    consensus,
    mostCommon,
  };
}
