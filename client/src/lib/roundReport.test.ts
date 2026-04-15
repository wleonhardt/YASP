import { describe, expect, it } from "vitest";
import type { PublicRoomState } from "@yasp/shared";
import { makePublicRoomState } from "../test/roomState";
import { buildRoundReport, formatExportFilename, toCsv, toJson } from "./roundReport";

function revealedState(overrides: Partial<PublicRoomState> = {}): PublicRoomState {
  return makePublicRoomState({
    id: "ROOM01",
    roundNumber: 3,
    revealed: true,
    participants: [
      {
        id: "me",
        name: "Alice",
        role: "voter",
        connected: true,
        hasVoted: true,
        isSelf: true,
        isModerator: true,
      },
      {
        id: "p2",
        name: "Bob",
        role: "voter",
        connected: true,
        hasVoted: true,
        isSelf: false,
        isModerator: false,
      },
      {
        id: "p3",
        name: "Carol",
        role: "voter",
        connected: true,
        hasVoted: true,
        isSelf: false,
        isModerator: false,
      },
      {
        id: "p4",
        name: "Dan",
        role: "spectator",
        connected: true,
        hasVoted: false,
        isSelf: false,
        isModerator: false,
      },
    ],
    votes: { me: "3", p2: "5", p3: "5" },
    stats: {
      totalVotes: 3,
      numericAverage: 4.3,
      distribution: { "3": 1, "5": 2 },
      consensus: false,
      mostCommon: "5",
    },
    ...overrides,
  });
}

describe("buildRoundReport", () => {
  it("returns null when the round is not revealed", () => {
    expect(buildRoundReport(makePublicRoomState({ revealed: false }), 0)).toBeNull();
  });

  it("snapshots voters sorted by name with numeric/spectator flags", () => {
    const report = buildRoundReport(revealedState(), 1_700_000_000_000);
    expect(report).not.toBeNull();
    expect(report?.voters.map((v) => v.name)).toEqual(["Alice", "Bob", "Carol"]);
    expect(report?.voters.map((v) => v.vote)).toEqual(["3", "5", "5"]);
    expect(report?.voters.every((v) => v.voteIsNumeric)).toBe(true);
  });

  it("computes median, spread, and sorted distribution", () => {
    const report = buildRoundReport(revealedState(), 1_700_000_000_000);
    expect(report?.stats.median).toBe(5);
    expect(report?.stats.spread).toBe(2);
    expect(report?.stats.distribution.map((d) => d.value)).toEqual(["5", "3"]);
    expect(report?.stats.mostCommon).toBe("5");
    expect(report?.stats.consensus).toBe(false);
    expect(report?.stats.totalVotes).toBe(3);
  });

  it("marks non-numeric votes as non-numeric", () => {
    const state = revealedState({
      votes: { me: "?", p2: "5", p3: "XL" },
      stats: {
        totalVotes: 3,
        numericAverage: 5,
        distribution: { "?": 1, "5": 1, XL: 1 },
        consensus: false,
        mostCommon: null,
      },
    });
    const report = buildRoundReport(state, 0);
    const alice = report?.voters.find((v) => v.name === "Alice");
    const carol = report?.voters.find((v) => v.name === "Carol");
    expect(alice?.voteIsNumeric).toBe(false);
    expect(carol?.voteIsNumeric).toBe(false);
  });
});

describe("toCsv", () => {
  it("produces RFC-ish CSV with header and escaped fields", () => {
    const report = buildRoundReport(revealedState(), 0);
    const csv = toCsv(report!);
    expect(csv.split("\r\n")[0]).toBe("Participant,Role,Vote");
    expect(csv).toContain("Alice,voter,3");
    expect(csv).toContain("Bob,voter,5");
  });

  it("escapes names containing commas and quotes", () => {
    const state = revealedState({
      participants: [
        {
          id: "me",
          name: 'Alice, "A"',
          role: "voter",
          connected: true,
          hasVoted: true,
          isSelf: true,
          isModerator: true,
        },
      ],
      votes: { me: "3" },
      stats: {
        totalVotes: 1,
        numericAverage: 3,
        distribution: { "3": 1 },
        consensus: true,
        mostCommon: "3",
      },
    });
    const csv = toCsv(buildRoundReport(state, 0)!);
    expect(csv).toContain('"Alice, ""A""",voter,3');
  });
});

describe("toJson", () => {
  it("produces pretty-printed JSON with snapshot fields", () => {
    const report = buildRoundReport(revealedState(), 1_700_000_000_000)!;
    const json = toJson(report);
    const parsed = JSON.parse(json);
    expect(parsed.roomId).toBe("ROOM01");
    expect(parsed.roundNumber).toBe(3);
    expect(parsed.revealedAt).toBe(1_700_000_000_000);
    expect(parsed.voters).toHaveLength(3);
    expect(parsed.stats.mostCommon).toBe("5");
  });
});

describe("formatExportFilename", () => {
  it("uses a date-stamped name per extension", () => {
    const report = buildRoundReport(revealedState(), Date.UTC(2026, 3, 15, 14, 30))!;
    expect(formatExportFilename(report, "csv")).toMatch(/^yasp-round-ROOM01-r3-.*\.csv$/);
    expect(formatExportFilename(report, "json")).toMatch(/^yasp-round-ROOM01-r3-.*\.json$/);
  });
});
