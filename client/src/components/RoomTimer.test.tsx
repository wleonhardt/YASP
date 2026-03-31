import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDisplayRemainingSeconds, RoomTimer } from "./RoomTimer";
import { makePublicRoomState } from "../test/roomState";
import * as storage from "../lib/storage";

const audioMocks = vi.hoisted(() => ({
  isRoomAudioPrimed: vi.fn().mockReturnValue(false),
  playTimerComplete: vi.fn().mockResolvedValue(true),
  playTimerHonk: vi.fn().mockResolvedValue(true),
  playTimerStart: vi.fn().mockResolvedValue(true),
  playTimerTick: vi.fn().mockResolvedValue(true),
  primeRoomAudio: vi.fn().mockResolvedValue(true),
}));

vi.mock("../lib/audio", () => audioMocks);

const handlers = () => ({
  onSetDuration: vi.fn(),
  onStart: vi.fn().mockResolvedValue(true),
  onPause: vi.fn(),
  onReset: vi.fn(),
  onHonk: vi.fn().mockResolvedValue(true),
});

describe("RoomTimer", () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.clearAllMocks();
    audioMocks.isRoomAudioPrimed.mockReturnValue(false);
    audioMocks.primeRoomAudio.mockResolvedValue(true);
    audioMocks.playTimerStart.mockResolvedValue(true);
    audioMocks.playTimerHonk.mockResolvedValue(true);
    audioMocks.playTimerTick.mockResolvedValue(true);
    audioMocks.playTimerComplete.mockResolvedValue(true);
  });

  it("renders moderator timer controls", () => {
    render(<RoomTimer state={makePublicRoomState()} {...handlers()} />);

    expect(screen.getByRole("heading", { name: "00:10" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /start/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /reset/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /beep/i })).toBeInTheDocument();
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
    expect(screen.queryByRole("button", { name: /beep/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sound on/i })).toBeInTheDocument();
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

    const beepButton = screen.getByRole("button", { name: /beep/i });
    expect(beepButton).toBeDisabled();
    expect(beepButton.textContent).toMatch(/\(\d\)/);
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

  it("does not render one second above the server timer snapshot when clocks drift", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(0));

    render(
      <RoomTimer
        state={makePublicRoomState({
          timer: {
            durationSeconds: 60,
            remainingSeconds: 60,
            running: true,
            endsAt: 60_900,
            completedAt: null,
            lastHonkAt: null,
            honkAvailableAt: null,
          },
        })}
        {...handlers()}
      />
    );

    expect(screen.getByRole("heading", { name: "01:00" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "01:01" })).not.toBeInTheDocument();
  });

  it("uses adjusted server time when the client clock lags behind", () => {
    expect(
      getDisplayRemainingSeconds(
        {
          durationSeconds: 60,
          remainingSeconds: 60,
          running: true,
          endsAt: 60_000,
          completedAt: null,
          lastHonkAt: null,
          honkAvailableAt: null,
        },
        0,
        900
      )
    ).toBe(59);
  });

  it("keeps the final second visible until the timer has actually expired", () => {
    expect(
      getDisplayRemainingSeconds(
        {
          durationSeconds: 10,
          remainingSeconds: 1,
          running: true,
          endsAt: 80,
          completedAt: null,
          lastHonkAt: null,
          honkAvailableAt: null,
        },
        0
      )
    ).toBe(1);

    expect(
      getDisplayRemainingSeconds(
        {
          durationSeconds: 10,
          remainingSeconds: 1,
          running: true,
          endsAt: 0,
          completedAt: null,
          lastHonkAt: null,
          honkAvailableAt: null,
        },
        0
      )
    ).toBe(0);
  });

  it("plays a local honk immediately after a successful honk action even when sound preference is off", async () => {
    const user = userEvent.setup();
    const props = handlers();
    vi.spyOn(storage, "getStoredTimerSoundEnabled").mockReturnValue(false);

    render(<RoomTimer state={makePublicRoomState()} {...props} />);

    await user.click(screen.getByRole("button", { name: /beep/i }));

    expect(audioMocks.primeRoomAudio).toHaveBeenCalled();
    expect(props.onHonk).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(audioMocks.playTimerHonk).toHaveBeenCalledTimes(1);
    });
  });

  it("plays a local start cue immediately after a successful start action when sound is on", async () => {
    const user = userEvent.setup();
    const props = handlers();

    render(<RoomTimer state={makePublicRoomState()} {...props} />);

    await user.click(screen.getByRole("button", { name: /start/i }));

    expect(audioMocks.primeRoomAudio).toHaveBeenCalled();
    expect(props.onStart).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(audioMocks.playTimerStart).toHaveBeenCalledTimes(1);
    });
  });

  it("plays a start cue when the timer begins and sound is enabled", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(0));
    audioMocks.isRoomAudioPrimed.mockReturnValue(true);

    const props = handlers();
    const { rerender } = render(<RoomTimer state={makePublicRoomState()} {...props} />);

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
    audioMocks.isRoomAudioPrimed.mockReturnValue(true);

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

    act(() => {
      vi.advanceTimersByTime(1_000);
    });

    expect(audioMocks.playTimerTick).toHaveBeenCalledWith("slow");
  });

  it("plays a faster tick in the last five seconds when sound is enabled", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(0));
    audioMocks.isRoomAudioPrimed.mockReturnValue(true);

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

    act(() => {
      vi.advanceTimersByTime(1_000);
    });

    expect(audioMocks.playTimerTick).toHaveBeenCalledWith("fast");
  });

  it("plays the completion ring when the timer finishes and sound is enabled", async () => {
    audioMocks.isRoomAudioPrimed.mockReturnValue(true);
    const props = handlers();
    const { rerender } = render(<RoomTimer state={makePublicRoomState()} {...props} />);

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

  it("keeps timer sounds off when the stored preference is off", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(0));
    vi.spyOn(storage, "getStoredTimerSoundEnabled").mockReturnValue(false);

    const props = handlers();
    const { rerender } = render(
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
        {...props}
      />
    );

    act(() => {
      vi.advanceTimersByTime(1_000);
    });

    rerender(
      <RoomTimer
        state={makePublicRoomState({
          timer: {
            durationSeconds: 10,
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

    expect(audioMocks.playTimerTick).not.toHaveBeenCalled();
    expect(audioMocks.playTimerComplete).not.toHaveBeenCalled();
  });

  it("keeps passive timer sounds quiet until audio has actually been primed", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(0));

    const props = handlers();
    const { rerender } = render(
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
        {...props}
      />
    );

    act(() => {
      vi.advanceTimersByTime(1_000);
    });

    rerender(
      <RoomTimer
        state={makePublicRoomState({
          timer: {
            durationSeconds: 10,
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

    expect(audioMocks.playTimerTick).not.toHaveBeenCalled();
    expect(audioMocks.playTimerComplete).not.toHaveBeenCalled();
  });

  it("does not assume audio is ready when priming fails, but still starts the timer", async () => {
    const user = userEvent.setup();
    const props = handlers();
    audioMocks.primeRoomAudio.mockResolvedValueOnce(false);

    render(<RoomTimer state={makePublicRoomState()} {...props} />);

    await user.click(screen.getByRole("button", { name: /start/i }));

    expect(props.onStart).toHaveBeenCalledTimes(1);
    expect(audioMocks.playTimerStart).not.toHaveBeenCalled();
  });
});
