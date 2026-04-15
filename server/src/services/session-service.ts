import type { SessionId, SocketId, RoomId } from "@yasp/shared";

export type SessionBinding = {
  sessionId: SessionId;
  roomId: RoomId;
};

/**
 * Tracks the current socket binding for this process only.
 *
 * Future distributed implementations can replace this with a cluster-aware
 * ephemeral binding store while preserving latest-tab-wins semantics.
 */
export interface SessionBindingStore {
  bind(socketId: SocketId, sessionId: SessionId, roomId: RoomId): void;
  unbind(socketId: SocketId): void;
  resolve(socketId: SocketId): SessionBinding | undefined;
}

export class InMemorySessionBindingStore implements SessionBindingStore {
  private socketBindings = new Map<SocketId, SessionBinding>();

  bind(socketId: SocketId, sessionId: SessionId, roomId: RoomId): void {
    this.socketBindings.set(socketId, { sessionId, roomId });
  }

  unbind(socketId: SocketId): void {
    this.socketBindings.delete(socketId);
  }

  resolve(socketId: SocketId): SessionBinding | undefined {
    return this.socketBindings.get(socketId);
  }
}
