import type {
  AckResult,
  DeckInput,
  ParticipantRole,
  RoomId,
  RoomSettings,
  SessionId,
  SocketId,
  VoteValue,
} from "@yasp/shared";
import type { Room } from "../domain/types.js";
import { InMemoryRoomStore } from "./room-store.js";
import { RoomService } from "./room-service.js";
import type { AsyncRoomStore } from "./async-room-store.js";
import { AsyncOperationQueue } from "./async-operation-queue.js";
import { allConnectedVotersVoted } from "./room-service.js";

type RoomScopedResult = { room: Room };

/**
 * Thin async adapter over the existing synchronous RoomService.
 *
 * Redis mode keeps the room-domain rules in one place by materializing the
 * active room state into a temporary in-memory store, running the existing
 * RoomService logic unchanged, then persisting the updated room back to the
 * async store.
 */
export class AsyncRoomService {
  constructor(
    private readonly store: AsyncRoomStore,
    private readonly operations: AsyncOperationQueue
  ) {}

  private async withAllRooms<T extends RoomScopedResult>(
    operation: (service: RoomService) => AckResult<T>
  ): Promise<AckResult<T>> {
    return this.operations.run(async () => {
      const tempStore = new InMemoryRoomStore();
      for (const room of await this.store.list()) {
        tempStore.save(room);
      }

      const service = new RoomService(tempStore);
      const result = operation(service);
      if (result.ok) {
        await this.store.save(result.data.room);
      }
      return result;
    });
  }

  private async withRoom<T extends RoomScopedResult>(
    roomId: RoomId,
    operation: (service: RoomService) => AckResult<T>
  ): Promise<AckResult<T>> {
    return this.operations.run(async () => {
      const tempStore = new InMemoryRoomStore();
      const room = await this.store.get(roomId);
      if (room) {
        tempStore.save(room);
      }

      const service = new RoomService(tempStore);
      const result = operation(service);
      if (result.ok) {
        await this.store.save(result.data.room);
      }
      return result;
    });
  }

  createRoom(
    sessionId: SessionId,
    socketId: SocketId,
    displayName: string,
    requestedRole: ParticipantRole,
    deckInput?: DeckInput
  ): Promise<AckResult<{ room: Room; participantId: string }>> {
    return this.withAllRooms((service) =>
      service.createRoom(sessionId, socketId, displayName, requestedRole, deckInput)
    );
  }

  joinRoom(
    roomId: RoomId,
    sessionId: SessionId,
    socketId: SocketId,
    displayName: string,
    requestedRole: ParticipantRole
  ): Promise<AckResult<{ room: Room; participantId: string; replacedSocketId: SocketId | null }>> {
    return this.withRoom(roomId, (service) =>
      service.joinRoom(roomId, sessionId, socketId, displayName, requestedRole)
    );
  }

  leaveRoom(roomId: RoomId, sessionId: SessionId): Promise<AckResult<{ room: Room }>> {
    return this.withRoom(roomId, (service) => service.leaveRoom(roomId, sessionId));
  }

  disconnectParticipant(roomId: RoomId, sessionId: SessionId): Promise<AckResult<{ room: Room }>> {
    return this.withRoom(roomId, (service) => service.disconnectParticipant(roomId, sessionId));
  }

  castVote(roomId: RoomId, sessionId: SessionId, value: VoteValue): Promise<AckResult<{ room: Room }>> {
    return this.withRoom(roomId, (service) => service.castVote(roomId, sessionId, value));
  }

  clearVote(roomId: RoomId, sessionId: SessionId): Promise<AckResult<{ room: Room }>> {
    return this.withRoom(roomId, (service) => service.clearVote(roomId, sessionId));
  }

  revealVotes(roomId: RoomId, sessionId: SessionId): Promise<AckResult<{ room: Room }>> {
    return this.withRoom(roomId, (service) => service.revealVotes(roomId, sessionId));
  }

  autoRevealIfReady(roomId: RoomId): Promise<AckResult<{ room: Room; changed: boolean }>> {
    return this.withRoom(roomId, (service) => service.autoRevealIfReady(roomId));
  }

  resetRound(roomId: RoomId, sessionId: SessionId): Promise<AckResult<{ room: Room }>> {
    return this.withRoom(roomId, (service) => service.resetRound(roomId, sessionId));
  }

  reopenVoting(roomId: RoomId, sessionId: SessionId): Promise<AckResult<{ room: Room }>> {
    return this.withRoom(roomId, (service) => service.reopenVoting(roomId, sessionId));
  }

  nextRound(roomId: RoomId, sessionId: SessionId): Promise<AckResult<{ room: Room }>> {
    return this.withRoom(roomId, (service) => service.nextRound(roomId, sessionId));
  }

  updateStoryLabel(roomId: RoomId, sessionId: SessionId, label: string): Promise<AckResult<{ room: Room }>> {
    return this.withRoom(roomId, (service) => service.updateStoryLabel(roomId, sessionId, label));
  }

  addStoryAgendaItems(
    roomId: RoomId,
    sessionId: SessionId,
    labels: string[]
  ): Promise<AckResult<{ room: Room }>> {
    return this.withRoom(roomId, (service) => service.addStoryAgendaItems(roomId, sessionId, labels));
  }

  removeStoryAgendaItem(
    roomId: RoomId,
    sessionId: SessionId,
    itemId: string
  ): Promise<AckResult<{ room: Room }>> {
    return this.withRoom(roomId, (service) => service.removeStoryAgendaItem(roomId, sessionId, itemId));
  }

  moveStoryAgendaItem(
    roomId: RoomId,
    sessionId: SessionId,
    itemId: string,
    direction: "up" | "down"
  ): Promise<AckResult<{ room: Room }>> {
    return this.withRoom(roomId, (service) =>
      service.moveStoryAgendaItem(roomId, sessionId, itemId, direction)
    );
  }

  startNextStory(roomId: RoomId, sessionId: SessionId): Promise<AckResult<{ room: Room }>> {
    return this.withRoom(roomId, (service) => service.startNextStory(roomId, sessionId));
  }

  transferModerator(
    roomId: RoomId,
    sessionId: SessionId,
    targetParticipantId: string
  ): Promise<AckResult<{ room: Room }>> {
    return this.withRoom(roomId, (service) =>
      service.transferModerator(roomId, sessionId, targetParticipantId)
    );
  }

  setTimerDuration(
    roomId: RoomId,
    sessionId: SessionId,
    durationSeconds: number
  ): Promise<AckResult<{ room: Room }>> {
    return this.withRoom(roomId, (service) => service.setTimerDuration(roomId, sessionId, durationSeconds));
  }

  startTimer(roomId: RoomId, sessionId: SessionId): Promise<AckResult<{ room: Room }>> {
    return this.withRoom(roomId, (service) => service.startTimer(roomId, sessionId));
  }

  pauseTimer(roomId: RoomId, sessionId: SessionId): Promise<AckResult<{ room: Room }>> {
    return this.withRoom(roomId, (service) => service.pauseTimer(roomId, sessionId));
  }

  resetTimer(roomId: RoomId, sessionId: SessionId): Promise<AckResult<{ room: Room }>> {
    return this.withRoom(roomId, (service) => service.resetTimer(roomId, sessionId));
  }

  completeTimer(roomId: RoomId): Promise<AckResult<{ room: Room }>> {
    return this.withRoom(roomId, (service) => service.completeTimer(roomId));
  }

  honkTimer(roomId: RoomId, sessionId: SessionId): Promise<AckResult<{ room: Room }>> {
    return this.withRoom(roomId, (service) => service.honkTimer(roomId, sessionId));
  }

  changeName(roomId: RoomId, sessionId: SessionId, name: string): Promise<AckResult<{ room: Room }>> {
    return this.withRoom(roomId, (service) => service.changeName(roomId, sessionId, name));
  }

  changeRole(
    roomId: RoomId,
    sessionId: SessionId,
    role: ParticipantRole
  ): Promise<AckResult<{ room: Room }>> {
    return this.withRoom(roomId, (service) => service.changeRole(roomId, sessionId, role));
  }

  changeDeck(roomId: RoomId, sessionId: SessionId, deckInput: DeckInput): Promise<AckResult<{ room: Room }>> {
    return this.withRoom(roomId, (service) => service.changeDeck(roomId, sessionId, deckInput));
  }

  updateSettings(
    roomId: RoomId,
    sessionId: SessionId,
    settingsUpdate: Partial<RoomSettings>
  ): Promise<AckResult<{ room: Room }>> {
    return this.withRoom(roomId, (service) => service.updateSettings(roomId, sessionId, settingsUpdate));
  }

  allConnectedVotersVoted(room: Room): boolean {
    return allConnectedVotersVoted(room);
  }
}
