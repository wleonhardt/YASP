import type { Server as SocketServer } from "socket.io";
import { RoomStore } from "./room-store.js";
import { reassignModeratorIfNeeded, hasConnectedParticipants } from "../domain/room.js";
import { serializeRoom } from "../transport/serializers.js";
import { now } from "../utils/time.js";
import { CLEANUP_INTERVAL_MS, DISCONNECTED_PARTICIPANT_GRACE_MS } from "../config.js";
import { TimerService } from "./timer-service.js";
import { logger } from "../utils/logger.js";

export class CleanupService {
  private intervalHandle: NodeJS.Timeout | null = null;

  constructor(
    private store: RoomStore,
    private timerService: TimerService,
    private io: SocketServer
  ) {}

  start(): void {
    this.intervalHandle = setInterval(() => this.run(), CLEANUP_INTERVAL_MS);
  }

  stop(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }

  run(): void {
    const t = now();

    for (const room of this.store.list()) {
      let changed = false;

      // Remove stale disconnected participants
      for (const p of room.participants.values()) {
        if (!p.connected && t - p.lastSeenAt > DISCONNECTED_PARTICIPANT_GRACE_MS) {
          // Clear auto-restore if the previous moderator is being cleaned up
          if (room.previousModeratorId === p.id) {
            room.previousModeratorId = null;
          }
          room.participants.delete(p.id);
          room.votes.delete(p.id);
          changed = true;
        }
      }

      // Reassign moderator if needed
      if (changed) {
        reassignModeratorIfNeeded(room);
      }

      // Delete expired rooms with no connected participants
      if (room.expiresAt <= t && !hasConnectedParticipants(room)) {
        this.timerService.cancelRoom(room.id);
        this.store.delete(room.id);
        logger.info("Room expired", { roomId: room.id });
        continue;
      }

      // Broadcast updated state if participants were cleaned up
      if (changed) {
        for (const p of room.participants.values()) {
          if (p.connected && p.socketId) {
            const state = serializeRoom(room, p.sessionId);
            this.io.to(p.socketId).emit("room_state", state);
          }
        }
      }
    }
  }
}
