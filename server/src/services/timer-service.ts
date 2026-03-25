import type { RoomId } from "@yasp/shared";

export class TimerService {
  private timers = new Map<RoomId, NodeJS.Timeout>();

  schedule(roomId: RoomId, delayMs: number, callback: () => void): void {
    this.cancel(roomId);
    const timer = setTimeout(() => {
      this.timers.delete(roomId);
      callback();
    }, delayMs);
    this.timers.set(roomId, timer);
  }

  cancel(roomId: RoomId): void {
    const existing = this.timers.get(roomId);
    if (existing) {
      clearTimeout(existing);
      this.timers.delete(roomId);
    }
  }

  cancelAll(): void {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
  }

  has(roomId: RoomId): boolean {
    return this.timers.has(roomId);
  }
}
