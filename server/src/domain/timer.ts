import type { RoomTimerState } from "@yasp/shared";
import { ROOM_TIMER_PRESET_SECONDS } from "@yasp/shared";

const ROOM_TIMER_PRESETS = Array.isArray(ROOM_TIMER_PRESET_SECONDS)
  ? ROOM_TIMER_PRESET_SECONDS
  : ([10, 30, 60, 120, 300] as const);

export function createRoomTimerState(): RoomTimerState {
  const defaultDurationSeconds = ROOM_TIMER_PRESETS[0] ?? 10;
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
