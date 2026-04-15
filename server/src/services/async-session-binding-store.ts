import type { RoomId, SessionId, SocketId } from "@yasp/shared";
import {
  InMemorySessionBindingStore,
  type SessionBinding,
  type SessionBindingStore,
} from "./session-service.js";

export type { SessionBinding };

/**
 * Async version of {@link SessionBindingStore} for Phase 2 optional horizontal
 * scaling.
 *
 * Maps a `socketId` to the `{sessionId, roomId}` pair that identifies which
 * room/user this socket currently represents. The entry is created on
 * `bind` (socket connect + join) and removed on `unbind` (disconnect). It
 * lives alongside the room data: the room's participant record tracks which
 * `socketId` is currently "active" for a given session, and the binding store
 * is consulted to reverse-resolve from a given socket.
 *
 * Latest-tab-wins semantics is NOT enforced here — it lives in the Room
 * (participant.socketId vs incoming socketId). The binding store is purely a
 * per-socket lookup and therefore remains the same shape in memory and in
 * Redis.
 */
export interface AsyncSessionBindingStore {
  bind(socketId: SocketId, sessionId: SessionId, roomId: RoomId): Promise<void>;
  unbind(socketId: SocketId): Promise<void>;
  resolve(socketId: SocketId): Promise<SessionBinding | undefined>;
}

/**
 * Async adapter around the existing sync {@link InMemorySessionBindingStore}.
 */
export class AsyncInMemorySessionBindingStore implements AsyncSessionBindingStore {
  private readonly inner: SessionBindingStore;

  constructor(inner: SessionBindingStore = new InMemorySessionBindingStore()) {
    this.inner = inner;
  }

  async bind(socketId: SocketId, sessionId: SessionId, roomId: RoomId): Promise<void> {
    this.inner.bind(socketId, sessionId, roomId);
  }

  async unbind(socketId: SocketId): Promise<void> {
    this.inner.unbind(socketId);
  }

  async resolve(socketId: SocketId): Promise<SessionBinding | undefined> {
    return this.inner.resolve(socketId);
  }
}
