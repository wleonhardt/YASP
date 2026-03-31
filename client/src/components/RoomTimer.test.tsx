import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RoomTimer } from "./RoomTimer";
import { makePublicRoomState } from "../test/roomState";

const audioMocks = vi.hoisted(() => ({
  playTimerComplete: vi.fn().mockResolvedValue(true),
  playTimerHonk: vi.fn().mockResolvedValue(true),
  playTimerStart: vi.fn().mockResolvedValue(true),
  playTimerTick: vi.fn().mockResolvedValue(true),
  primeRoomAudio: vi.fn().mockResolvedValue(true),
}));

vi.mock("../lib/audio", () => audioMocks);

const handlers = () => ({
  onSetDuration: vi.fn(),
  onStart: vi.fn(),
  onPause: vi.fn(),
  onReset: vi.fn(),
  onHonk: vi.fn().mockResolvedValue(true),
});

describe("RoomTimer", () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("renders moderator timer controls", () => {
    render(<RoomTimer state={makePublicRoomState()} {...handlers()} />);

    expect(screen.getByRole("heading", { name: "01:00" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /start/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /reset/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /honk/i })).toBeInTheDocument();
  });

  it("hides moderator-only actions for non-moderators", () => {
    render(
      <RoomTimer
        state={makePublicRoomState({
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
        state={makePublicRoomState({
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
        state={makePublicRoomState({
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
        state={makePublicRoomState({
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

  it("synchronizes countdown immediately when a timer starts after mount", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(0));

    const props = handlers();
    const { rerender } = render(<RoomTimer state={makePublicRoomState()} {...props} />);

    vi.setSystemTime(new Date(24_000));
    rerender(
      <RoomTimer
        state={makePublicRoomState({
          timer: {
            durationSeconds: 60,
            remainingSeconds: 60,
            running: true,
            endsAt: 84_000,
            completedAt: null,
            lastHonkAt: null,
            honkAvailableAt: null,
          },
        })}
        {...props}
      />
    );

    expect(screen.getByRole("heading", { name: "01:00" })).toBeInTheDocument();
  });

  it("plays a local honk immediately after a successful honk action", async () => {
    const user = userEvent.setup();
    const props = handlers();

    render(<RoomTimer state={makePublicRoomState()} {...props} />);

    await user.click(screen.getByRole("button", { name: /honk/i }));

    expect(audioMocks.primeRoomAudio).toHaveBeenCalled();
    expect(props.onHonk).toHaveBeenCalledTimes(1);
    expect(audioMocks.playTimerHonk).toHaveBeenCalledTimes(1);
  });

  it("plays a start cue when the timer begins and sound is enabled", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(0));

    const props = handlers();
    const { rerender } = render(<RoomTimer state={makePublicRoomState()} {...props} />);

    await act(async () => {
      screen.getByRole("button", { name: /sound/i }).click();
    });

    rerender(
      <RoomTimer
        state={makePublicRoomState({
          timer: {
            durationSeconds: 60,
            remainingSeconds: 60,
            running: true,
            endsAt: 60_000,
            completedAt: null,
            lastHonkAt: null,
            honkAvailableAt: null,
          },
        })}
        {...props}
      />
    );

    expect(audioMocks.playTimerStart).toHaveBeenCalledTimes(1);
  });

  it("plays a slower tick in the last ten seconds when sound is enabled", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(0));

    render(
      <RoomTimer
        state={makePublicRoomState({
          timer: {
            durationSeconds: 10,
            remainingSeconds: 10,
            running: true,
            endsAt: 10_000,
            completedAt: null,
            lastHonkAt: null,
            honkAvailableAt: null,
          },
        })}
        {...handlers()}
      />
    );

    await act(async () => {
      screen.getByRole("button", { name: /sound/i }).click();
    });

    act(() => {
      vi.advanceTimersByTime(1_000);
    });

    expect(audioMocks.playTimerTick).toHaveBeenCalledWith("slow");
  });

  it("plays a faster tick in the last five seconds when sound is enabled", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(0));

    render(
      <RoomTimer
        state={makePublicRoomState({
          timer: {
            durationSeconds: 5,
            remainingSeconds: 5,
            running: true,
            endsAt: 5_000,
            completedAt: null,
            lastHonkAt: null,
            honkAvailableAt: null,
          },
        })}
        {...handlers()}
      />
    );

    await act(async () => {
      screen.getByRole("button", { name: /sound/i }).click();
    });

    act(() => {
      vi.advanceTimersByTime(1_000);
    });

    expect(audioMocks.playTimerTick).toHaveBeenCalledWith("fast");
  });

  it("plays the completion ring when the timer finishes and sound is enabled", async () => {
    const props = handlers();
    const { rerender } = render(<RoomTimer state={makePublicRoomState()} {...props} />);

    await act(async () => {
      screen.getByRole("button", { name: /sound/i }).click();
    });

    rerender(
      <RoomTimer
        state={makePublicRoomState({
          timer: {
            durationSeconds: 60,
            remainingSeconds: 0,
            running: false,
            endsAt: null,
            completedAt: 1234,
            lastHonkAt: null,
            honkAvailableAt: null,
          },
        })}
        {...props}
      />
    );

    expect(audioMocks.playTimerComplete).toHaveBeenCalledTimes(1);
  });
});
