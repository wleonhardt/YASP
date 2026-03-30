import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { PublicRoomState } from "@yasp/shared";
import { DEFAULT_DECKS, DEFAULT_ROOM_SETTINGS } from "@yasp/shared";
import { RoomTimer } from "./RoomTimer";

function makeState(overrides: Partial<PublicRoomState> = {}): PublicRoomState {
  return {
    id: "ROOM01",
    roundNumber: 1,
    revealed: false,
    deck: DEFAULT_DECKS.fibonacci,
    settings: { ...DEFAULT_ROOM_SETTINGS },
    timer: {
      durationSeconds: 60,
      remainingSeconds: 60,
      running: false,
      endsAt: null,
      completedAt: null,
      lastHonkAt: null,
      honkAvailableAt: null,
    },
    participants: [
      {
        id: "me",
        name: "Alice",
        role: "voter",
        connected: true,
        hasVoted: false,
        isSelf: true,
        isModerator: true,
      },
    ],
    votes: null,
    stats: null,
    me: {
      participantId: "me",
      sessionId: "session-1",
      connected: true,
    },
    ...overrides,
  };
}

const handlers = () => ({
  onSetDuration: vi.fn(),
  onStart: vi.fn(),
  onPause: vi.fn(),
  onReset: vi.fn(),
  onHonk: vi.fn(),
});

describe("RoomTimer", () => {
  it("renders moderator timer controls", () => {
    render(<RoomTimer state={makeState()} {...handlers()} />);

    expect(screen.getByRole("heading", { name: "01:00" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /start/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /reset/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /honk/i })).toBeInTheDocument();
  });

  it("hides moderator-only actions for non-moderators", () => {
    render(
      <RoomTimer
        state={makeState({
          participants: [
            {
              id: "me",
              name: "Alice",
              role: "voter",
              connected: true,
              hasVoted: false,
              isSelf: true,
              isModerator: false,
            },
          ],
        })}
        {...handlers()}
      />
    );

    expect(screen.queryByRole("button", { name: /start/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /honk/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sound/i })).toBeInTheDocument();
  });

  it("shows Pause instead of Start when running", () => {
    render(
      <RoomTimer
        state={makeState({
          timer: {
            durationSeconds: 60,
            remainingSeconds: 45,
            running: true,
            endsAt: Date.now() + 45_000,
            completedAt: null,
            lastHonkAt: null,
            honkAvailableAt: null,
          },
        })}
        {...handlers()}
      />
    );

    expect(screen.getByRole("button", { name: /pause/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /start/i })).not.toBeInTheDocument();
  });

  it("disables honk button during cooldown and shows remaining seconds", () => {
    render(
      <RoomTimer
        state={makeState({
          timer: {
            durationSeconds: 60,
            remainingSeconds: 60,
            running: false,
            endsAt: null,
            completedAt: null,
            lastHonkAt: Date.now(),
            honkAvailableAt: Date.now() + 4_000,
          },
        })}
        {...handlers()}
      />
    );

    const honkButton = screen.getByRole("button", { name: /honk/i });
    expect(honkButton).toBeDisabled();
    expect(honkButton.textContent).toMatch(/\(\d\)/);
  });

  it("disables duration select while timer is running", () => {
    render(
      <RoomTimer
        state={makeState({
          timer: {
            durationSeconds: 60,
            remainingSeconds: 30,
            running: true,
            endsAt: Date.now() + 30_000,
            completedAt: null,
            lastHonkAt: null,
            honkAvailableAt: null,
          },
        })}
        {...handlers()}
      />
    );

    expect(screen.getByRole("combobox")).toBeDisabled();
  });
});
