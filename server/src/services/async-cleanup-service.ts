import { reassignModeratorIfNeeded, hasConnectedParticipants } from "../domain/room.js";
import { now } from "../utils/time.js";
import { CLEANUP_INTERVAL_MS, DISCONNECTED_PARTICIPANT_GRACE_MS } from "../config.js";
import type { RoomTimerScheduler } from "./timer-service.js";
import type { AsyncRoomStore } from "./async-room-store.js";
import { AsyncOperationQueue } from "./async-operation-queue.js";
import { logger } from "../utils/logger.js";

type AsyncRoomStatePublisherPort = {
  broadcastRoomState(roomId: string): Promise<void>;
};

export class AsyncCleanupService {
  private intervalHandle: NodeJS.Timeout | null = null;

  constructor(
    private readonly store: AsyncRoomStore,
    private readonly timerScheduler: RoomTimerScheduler,
    private readonly roomStatePublisher: AsyncRoomStatePublisherPort,
    private readonly operations: AsyncOperationQueue
  ) {}

  start(): void {
    this.intervalHandle = setInterval(() => {
      void this.run().catch((error) => {
        logger.error("Redis cleanup run failed", {
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }, CLEANUP_INTERVAL_MS);
  }

  stop(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }

  async run(): Promise<void> {
    await this.operations.run(async () => {
      const t = now();

      for (const room of await this.store.list()) {
        let changed = false;

        for (const [sessionId, participant] of room.participants.entries()) {
          if (!participant.connected && t - participant.lastSeenAt > DISCONNECTED_PARTICIPANT_GRACE_MS) {
            if (room.previousModeratorId === participant.id) {
              room.previousModeratorId = null;
            }
            room.participants.delete(sessionId);
            room.votes.delete(participant.id);
            changed = true;
          }
        }

        if (changed) {
          reassignModeratorIfNeeded(room);
        }

        if (room.expiresAt <= t && !hasConnectedParticipants(room)) {
          this.timerScheduler.cancelRoom(room.id);
          await this.store.delete(room.id);
          logger.info("Room expired", { roomId: room.id });
          continue;
        }

        if (changed) {
          await this.store.save(room);
          await this.roomStatePublisher.broadcastRoomState(room.id);
        }
      }
    });
  }
}
