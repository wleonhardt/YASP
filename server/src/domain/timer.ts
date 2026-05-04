import type { RoomTimerState } from "@yasp/shared";

export function createRoomTimerState(): RoomTimerState {
  const defaultDurationSeconds = 60;
  return {
    durationSeconds: defaultDurationSeconds,
    remainingSeconds: defaultDurationSeconds,
    running: false,
    endsAt: null,
    completedAt: null,
    lastHonkAt: null,
    honkAvailableAt: null,
  };
}

export function getRemainingSeconds(timer: RoomTimerState, atMs: number): number {
  if (!timer.running || timer.endsAt === null) {
    return timer.remainingSeconds;
  }

  return Math.max(0, Math.ceil((timer.endsAt - atMs) / 1000));
}
