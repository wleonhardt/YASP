import type {
  PublicRoomState,
  PublicParticipant,
  RevealStats,
  SessionRoundSnapshot,
  VoteValue,
} from "@yasp/shared";
import { getMedian, getNumericVotes, getSpread } from "./room";

export type RoundReportVoter = {
  participantId: string;
  name: string;
  role: "voter" | "spectator";
  vote: VoteValue | null;
  voteIsNumeric: boolean;
};

export type RoundReportDistributionEntry = {
  value: string;
  count: number;
};

export type RoundReport = {
  roomId: string;
  roundNumber: number;
  revealedAt: number;
  deckLabel: string;
  deckType: string;
  voters: RoundReportVoter[];
  stats: {
    totalVotes: number;
    numericAverage: number | null;
    median: number | null;
    spread: number | null;
    mostCommon: string | null;
    consensus: boolean;
    distribution: RoundReportDistributionEntry[];
  };
};

export type RoundReportPlainTextSummary = {
  heading: string;
  meta?: string;
  deck: string;
  stats: Array<{
    label: string;
    value: string;
  }>;
  votesHeading: string;
  votes: string[];
};

function isNumericVote(value: VoteValue): boolean {
  const parsed = Number(value);
  return Number.isFinite(parsed) && String(parsed) === value;
}

export function formatRoundReportTime(timestamp: number, locale: string): string {
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) {
    return "";
  }

  try {
    return new Intl.DateTimeFormat(locale, {
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
  } catch {
    return date.toTimeString().slice(0, 5);
  }
}

export function toPlainTextSummary(summary: RoundReportPlainTextSummary): string {
  const lines = [
    summary.heading,
    summary.meta,
    summary.deck,
    ...summary.stats.map(({ label, value }) => `${label}: ${value}`),
    `${summary.votesHeading}: ${summary.votes.join("; ")}`,
  ].filter((line): line is string => Boolean(line));

  return lines.join("\n");
}

export async function writeTextToClipboard(
  text: string,
  clipboard: Pick<Clipboard, "writeText"> | null | undefined = typeof navigator !== "undefined"
    ? navigator.clipboard
    : undefined
): Promise<void> {
  if (!clipboard?.writeText) {
    throw new Error("Clipboard unavailable");
  }

  await clipboard.writeText(text);
}

/**
 * Build a self-contained snapshot of the currently revealed round.
 *
 * Ephemeral by design: the snapshot only covers the round the moderator
 * is viewing right now. Nothing is persisted anywhere — the snapshot
 * disappears when the modal closes unless the moderator explicitly
 * exports it.
 */
export function buildRoundReport(state: PublicRoomState, revealedAt: number): RoundReport | null {
  if (!state.revealed || !state.stats) {
    return null;
  }

  const stats: RevealStats = state.stats;
  const votes = state.votes ?? {};
  const numericVotes = getNumericVotes(state);

  const voters: RoundReportVoter[] = state.participants
    .filter((participant) => participant.role === "voter" || votes[participant.id] !== undefined)
    .map((participant: PublicParticipant) => {
      const rawVote = votes[participant.id];
      const vote = rawVote ?? null;
      return {
        participantId: participant.id,
        name: participant.name,
        role: participant.role,
        vote,
        voteIsNumeric: vote !== null ? isNumericVote(vote) : false,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const distribution: RoundReportDistributionEntry[] = Object.entries(stats.distribution)
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => (b.count !== a.count ? b.count - a.count : a.value.localeCompare(b.value)));

  return {
    roomId: state.id,
    roundNumber: state.roundNumber,
    revealedAt,
    deckLabel: state.deck.label,
    deckType: state.deck.type,
    voters,
    stats: {
      totalVotes: stats.totalVotes,
      numericAverage: stats.numericAverage,
      median: getMedian(numericVotes),
      spread: getSpread(numericVotes),
      mostCommon: stats.mostCommon,
      consensus: stats.consensus,
      distribution,
    },
  };
}

function csvEscape(value: string): string {
  if (value.includes(",") || value.includes("\n") || value.includes('"')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function toCsv(report: RoundReport): string {
  const header = ["Participant", "Role", "Vote"];
  const rows = report.voters.map((voter) =>
    [voter.name, voter.role, voter.vote ?? ""].map(csvEscape).join(",")
  );
  return [header.join(","), ...rows].join("\r\n") + "\r\n";
}

export function toJson(report: RoundReport): string {
  return JSON.stringify(report, null, 2);
}

export function formatExportFilename(report: RoundReport, extension: "csv" | "json"): string {
  const date = new Date(report.revealedAt);
  const iso = Number.isFinite(date.getTime())
    ? date
        .toISOString()
        .replace(/[:.]/g, "-")
        .replace("T", "_")
        .replace(/-\d{3}Z$/, "Z")
    : "snapshot";
  return `yasp-round-${report.roomId}-r${report.roundNumber}-${iso}.${extension}`;
}

// ---------------------------------------------------------------------------
// Session-level export helpers
// ---------------------------------------------------------------------------

function isNumericVoteStr(value: string): boolean {
  const parsed = Number(value);
  return Number.isFinite(parsed) && String(parsed) === value;
}

/**
 * Build a flat CSV covering all completed rounds in a session.
 * Columns: round_number, revealed_at, deck_label, participant_name,
 *          participant_role, vote, is_numeric_vote, numeric_vote_value,
 *          average, median, most_common, consensus, tie
 */
export function sessionToCsv(snapshots: SessionRoundSnapshot[], locale: string): string {
  const header = [
    "round_number",
    "revealed_at",
    "deck_label",
    "participant_name",
    "participant_role",
    "vote",
    "is_numeric_vote",
    "numeric_vote_value",
    "average",
    "median",
    "most_common",
    "consensus",
    "tie",
  ];

  const rows: string[] = [];

  for (const snap of snapshots) {
    const revealedAtLabel = formatRoundReportTime(snap.revealedAt, locale);
    const numericVotes = snap.participants
      .map((p) => p.vote)
      .filter((v): v is string => v !== null && isNumericVoteStr(v))
      .map(Number);
    const median = numericVotes.length > 0 ? computeMedian(numericVotes) : null;
    const avg = snap.stats.numericAverage !== null ? String(snap.stats.numericAverage) : "";
    const medianStr = median !== null ? String(median) : "";
    const mostCommon = snap.stats.mostCommon ?? "";
    const consensus = snap.stats.consensus ? "true" : "false";
    const tie = snap.stats.mostCommon === null && snap.stats.totalVotes > 0 ? "true" : "false";

    for (const p of snap.participants) {
      const voteStr = p.vote ?? "";
      const isNumeric = p.vote !== null && isNumericVoteStr(p.vote) ? "true" : "false";
      const numericVal = p.vote !== null && isNumericVoteStr(p.vote) ? p.vote : "";

      rows.push(
        [
          String(snap.roundNumber),
          revealedAtLabel,
          snap.deck.label,
          p.name,
          p.role,
          voteStr,
          isNumeric,
          numericVal,
          avg,
          medianStr,
          mostCommon,
          consensus,
          tie,
        ]
          .map(csvEscape)
          .join(",")
      );
    }
  }

  return [header.join(","), ...rows].join("\r\n") + "\r\n";
}

function computeMedian(sorted: number[]): number | null {
  const nums = [...sorted].sort((a, b) => a - b);
  if (nums.length === 0) return null;
  const mid = Math.floor(nums.length / 2);
  return nums.length % 2 === 0 ? ((nums[mid - 1] ?? 0) + (nums[mid] ?? 0)) / 2 : (nums[mid] ?? null);
}

export function sessionToJson(snapshots: SessionRoundSnapshot[]): string {
  return JSON.stringify(snapshots, null, 2);
}

export function formatSessionExportFilename(roomId: string, extension: "csv" | "json"): string {
  const iso = new Date()
    .toISOString()
    .replace(/[:.]/g, "-")
    .replace("T", "_")
    .replace(/-\d{3}Z$/, "Z");
  return `yasp-session-${roomId}-${iso}.${extension}`;
}

/**
 * Build plain-text summary for clipboard: one compact block per round.
 */
export function sessionToPlainText(
  snapshots: SessionRoundSnapshot[],
  roomId: string,
  locale: string,
  t: (key: string, opts?: Record<string, unknown>) => string
): string {
  const lines: string[] = [t("room.sessionReport.summaryHeading", { roomId }), ""];

  for (const snap of snapshots) {
    const revealedAtLabel = formatRoundReportTime(snap.revealedAt, locale);
    const numericVotes = snap.participants
      .map((p) => p.vote)
      .filter((v): v is string => v !== null && isNumericVoteStr(v))
      .map(Number);
    const median = computeMedian(numericVotes);

    lines.push(
      t("room.roundReport.meta", { round: snap.roundNumber, time: revealedAtLabel }),
      t("room.roundReport.deck", { deck: snap.deck.label })
    );

    if (snap.stats.numericAverage !== null) {
      lines.push(`${t("room.average")}: ${snap.stats.numericAverage}`);
    }
    if (median !== null) {
      lines.push(`${t("room.median")}: ${median}`);
    }
    if (snap.stats.mostCommon !== null) {
      lines.push(`${t("room.mostCommon")}: ${snap.stats.mostCommon}`);
    }

    const consensusLabel = snap.stats.consensus
      ? t("room.consensusReached")
      : snap.stats.mostCommon === null && snap.stats.totalVotes > 0
        ? t("room.tie")
        : t("room.noConsensus");
    lines.push(`${t("room.consensus")}: ${consensusLabel}`);

    const voteEntries = snap.participants
      .filter((p) => p.role === "voter" || p.vote !== null)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((p) => `${p.name}: ${p.vote ?? t("room.participant.notVoted")}`);
    lines.push(`${t("room.roundReport.votes")}: ${voteEntries.join("; ")}`);
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}

/**
 * Trigger a browser download for an ephemeral Blob. The object URL is
 * released after the click fires so the data never lingers beyond the
 * export itself.
 */
export function downloadBlob(filename: string, content: string, mimeType: string): void {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return;
  }

  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  // Release immediately — the click has already started the download.
  URL.revokeObjectURL(url);
}
