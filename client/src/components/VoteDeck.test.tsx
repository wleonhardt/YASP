import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VoteDeck } from "./VoteDeck";
import { makePublicRoomState } from "../test/roomState";
import i18n from "../i18n";

describe("VoteDeck shortcuts hint", () => {
  let coarsePointer = false;

  beforeEach(() => {
    coarsePointer = false;
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches:
          query.includes("(hover: none)") ||
          query.includes("(pointer: coarse)") ||
          query.includes("(max-width: 720px)")
            ? coarsePointer
            : false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  beforeEach(async () => {
    await i18n.changeLanguage("en");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows keyboard shortcuts on desktop layouts", () => {
    render(
      <VoteDeck state={makePublicRoomState()} selectedCard={null} onVote={vi.fn()} onClearVote={vi.fn()} />
    );

    expect(screen.getByText(/shortcuts:/i)).toBeInTheDocument();
  });

  it("hides keyboard shortcuts on touch-oriented layouts", () => {
    coarsePointer = true;

    render(
      <VoteDeck state={makePublicRoomState()} selectedCard={null} onVote={vi.fn()} onClearVote={vi.fn()} />
    );

    expect(screen.queryByText(/shortcuts:/i)).not.toBeInTheDocument();
  });
});
