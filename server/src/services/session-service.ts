import type { SessionId, SocketId, RoomId } from "@yasp/shared";

/**
 * Maps socketId -> { sessionId, roomId } for resolving caller identity.
 */
export class SessionService {
  private socketBindings = new Map<SocketId, { sessionId: SessionId; roomId: RoomId }>();

  bind(socketId: SocketId, sessionId: SessionId, roomId: RoomId): void {
    this.socketBindings.set(socketId, { sessionId, roomId });
  }

  unbind(socketId: SocketId): void {
    this.socketBindings.delete(socketId);
  }

  resolve(socketId: SocketId): { sessionId: SessionId; roomId: RoomId } | undefined {
    return this.socketBindings.get(socketId);
  }
}
