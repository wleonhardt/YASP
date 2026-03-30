import type { RoomId } from "@yasp/shared";

type TimerChannel = "auto-reveal" | "room-timer";

export class TimerService {
  private timers = new Map<string, NodeJS.Timeout>();

  private getKey(channel: TimerChannel, roomId: RoomId): string {
    return `${channel}:${roomId}`;
  }

  private schedule(channel: TimerChannel, roomId: RoomId, delayMs: number, callback: () => void): void {
    this.cancel(channel, roomId);
    const timer = setTimeout(() => {
      this.timers.delete(this.getKey(channel, roomId));
      callback();
    }, delayMs);
    this.timers.set(this.getKey(channel, roomId), timer);
  }

  private cancel(channel: TimerChannel, roomId: RoomId): void {
    const existing = this.timers.get(this.getKey(channel, roomId));
    if (existing) {
      clearTimeout(existing);
      this.timers.delete(this.getKey(channel, roomId));
    }
  }

  scheduleAutoReveal(roomId: RoomId, delayMs: number, callback: () => void): void {
    this.schedule("auto-reveal", roomId, delayMs, callback);
  }

  cancelAutoReveal(roomId: RoomId): void {
    this.cancel("auto-reveal", roomId);
  }

  scheduleRoomTimer(roomId: RoomId, delayMs: number, callback: () => void): void {
    this.schedule("room-timer", roomId, delayMs, callback);
  }

  cancelRoomTimer(roomId: RoomId): void {
    this.cancel("room-timer", roomId);
  }

  cancelRoom(roomId: RoomId): void {
    this.cancelAutoReveal(roomId);
    this.cancelRoomTimer(roomId);
  }

  cancelAll(): void {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
  }
}
