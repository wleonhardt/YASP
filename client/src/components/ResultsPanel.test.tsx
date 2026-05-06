import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Deck, PublicParticipant, PublicRoomState } from "@yasp/shared";
import { makePublicRoomState } from "../test/roomState";
import { ResultsPanel } from "./ResultsPanel";

function buildParticipants(votes: string[]): PublicParticipant[] {
  return votes.map((_, index) => ({
    id: index === 0 ? "me" : `p${index + 1}`,
    name: index === 0 ? "Alice" : `Player ${index + 1}`,
    role: "voter",
    connected: true,
    hasVoted: true,
    isSelf: index === 0,
    isModerator: index === 0,
  }));
}

function buildDistribution(votes: string[]): Record<string, number> {
  return votes.reduce<Record<string, number>>((distribution, vote) => {
    distribution[vote] = (distribution[vote] ?? 0) + 1;
    return distribution;
  }, {});
}

function makeRevealedState({
  consensus = false,
  deck,
  mostCommon,
  numericAverage = 4,
  votes,
}: {
  consensus?: boolean;
  deck: Deck;
  mostCommon: string | null;
  numericAverage?: number | null;
  votes: string[];
}): PublicRoomState {
  return makePublicRoomState({
    revealed: true,
    deck,
    participants: buildParticipants(votes),
    votes: Object.fromEntries(votes.map((vote, index) => [index === 0 ? "me" : `p${index + 1}`, vote])),
    stats: {
      totalVotes: votes.length,
      numericAverage,
      distribution: buildDistribution(votes),
      consensus,
      mostCommon,
    },
  });
}

function distributionRegion() {
  return screen.getByRole("region", { name: /distribution/i });
}

function distributionColumns() {
  return within(distributionRegion()).getAllByRole("listitem");
}

function distributionLabels() {
  return distributionColumns().map(
    (column) => column.querySelector(".distribution-column__label")?.textContent
  );
}

describe("ResultsPanel", () => {
  it("renders distribution columns in deck order instead of popularity order", () => {
    const deck: Deck = {
      type: "custom",
      label: "Planning",
      cards: ["1", "2", "3", "5", "?"],
    };

    render(
      <ResultsPanel
        state={makeRevealedState({ deck, mostCommon: "5", votes: ["5", "5", "5", "3", "3", "1", "?"] })}
      />
    );

    const columns = distributionColumns();

    expect(distributionLabels()).toEqual(["1", "2", "3", "5", "?"]);
    expect(columns[1]).toHaveClass("distribution-column--empty");
    expect(columns[1].querySelector(".distribution-column__count > .sr-only")).toHaveTextContent("0");
    expect(columns[3]).toHaveClass("distribution-column--mode");
  });

  it("keeps non-numeric values at the right with a separator and preserves unexpected vote tokens", () => {
    const deck: Deck = {
      type: "custom",
      label: "Mixed",
      cards: ["1", "?", "2", "pause"],
    };

    render(
      <ResultsPanel
        state={makeRevealedState({ deck, mostCommon: null, votes: ["1", "2", "13", "?", "pause"] })}
      />
    );

    const columns = distributionColumns();

    expect(distributionLabels()).toEqual(["1", "2", "13", "?", "pause"]);
    expect(columns[3]).toHaveClass("distribution-column--separator");
    expect(columns[4]).not.toHaveClass("distribution-column--separator");
  });

  it("renders the compact Average, Median, Mode, Spread stat strip", () => {
    const deck: Deck = {
      type: "custom",
      label: "Planning",
      cards: ["1", "3", "5", "?"],
    };

    render(
      <ResultsPanel state={makeRevealedState({ deck, mostCommon: "5", votes: ["1", "3", "5", "5", "?"] })} />
    );

    const stats = screen.getByRole("region", { name: /key stats/i });

    expect(within(stats).getByText("Average")).toBeInTheDocument();
    expect(within(stats).getByText("Median")).toBeInTheDocument();
    expect(within(stats).getByText("Mode")).toBeInTheDocument();
    expect(within(stats).getByText("Spread")).toBeInTheDocument();
  });

  it("surfaces a tone-safe outlier prompt and keeps names inside the disclosure", () => {
    const deck: Deck = {
      type: "custom",
      label: "Planning",
      cards: ["1", "2", "3", "5", "8", "13", "21"],
    };

    render(
      <ResultsPanel state={makeRevealedState({ deck, mostCommon: "5", votes: ["5", "5", "5", "21"] })} />
    );

    const prompt = screen.getByText("One estimate differs — worth a quick check?");
    const summary = prompt.closest("summary");
    const details = prompt.closest("details");

    expect(summary).not.toBeNull();
    expect(details).not.toBeNull();
    expect(summary).not.toHaveTextContent("Player 4");
    expect(details).not.toHaveAttribute("open");

    fireEvent.click(summary as HTMLElement);

    expect(details).toHaveAttribute("open");
    expect(screen.getByText("Most common estimate: 5")).toBeInTheDocument();
    expect(screen.getByText("Player 4")).toBeInTheDocument();
  });

  it("does not render the outlier prompt for close estimates", () => {
    const deck: Deck = {
      type: "custom",
      label: "Planning",
      cards: ["1", "2", "3", "5", "8", "13", "21"],
    };

    render(
      <ResultsPanel state={makeRevealedState({ deck, mostCommon: "5", votes: ["3", "5", "5", "8"] })} />
    );

    expect(screen.queryByText(/worth a quick check/i)).not.toBeInTheDocument();
  });

  it("surfaces an almost-consensus prompt for one close differing estimate", () => {
    const deck: Deck = {
      type: "custom",
      label: "Planning",
      cards: ["1", "2", "3", "5", "8", "13", "21"],
    };

    render(
      <ResultsPanel state={makeRevealedState({ deck, mostCommon: "5", votes: ["5", "5", "8", "5"] })} />
    );

    const prompt = screen.getByText("Almost there — one estimate differs.");
    const summary = prompt.closest("summary");
    const details = prompt.closest("details");

    expect(summary).not.toBeNull();
    expect(details).not.toBeNull();
    expect(summary).not.toHaveTextContent("Player 3");
    expect(details).not.toHaveAttribute("open");

    fireEvent.click(summary as HTMLElement);

    expect(details).toHaveAttribute("open");
    expect(screen.getByText("Shared estimate: 5")).toBeInTheDocument();
    expect(screen.getByText("Player 3")).toBeInTheDocument();
  });

  it("renders a decorative consensus flourish only when everyone agrees", () => {
    const deck: Deck = {
      type: "custom",
      label: "Planning",
      cards: ["1", "2", "3", "5"],
    };

    const { rerender } = render(
      <ResultsPanel
        state={makeRevealedState({ consensus: true, deck, mostCommon: "5", votes: ["5", "5", "5"] })}
      />
    );

    const consensusStatus = screen.getByText("Consensus reached").closest('[role="status"]') as HTMLElement;
    expect(consensusStatus).not.toBeNull();
    const burst = consensusStatus.querySelector(".results-panel__consensus-burst");

    expect(burst).not.toBeNull();
    expect(burst).toHaveAttribute("aria-hidden", "true");
    expect(burst?.querySelectorAll("span")).toHaveLength(3);

    rerender(
      <ResultsPanel
        state={makeRevealedState({ consensus: false, deck, mostCommon: "5", votes: ["5", "5", "3"] })}
      />
    );

    const splitStatus = screen.getByText("No consensus").closest('[role="status"]') as HTMLElement;
    expect(splitStatus).not.toBeNull();
    expect(splitStatus).not.toHaveClass("results-panel__consensus--celebrate");
    expect(document.querySelector(".results-panel__consensus-burst")).toBeNull();
  });
});
