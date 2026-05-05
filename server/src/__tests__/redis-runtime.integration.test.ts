import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { io, type Socket } from "socket.io-client";
import type {
  AckResult,
  CreateRoomOutput,
  JoinRoomOutput,
  PublicRoomState,
  ServerErrorEvent,
} from "@yasp/shared";
import { DISCONNECTED_PARTICIPANT_GRACE_MS } from "../config.js";
import { createServerRuntime, type ServerRuntime } from "../runtime.js";
import { getLiveRedisTestUrl, hasLiveRedisTestUrl, resetLiveRedisDb } from "./redis-test-utils.js";

const EVENT_TIMEOUT_MS = 5_000;
const RUNTIME_REDIS_DB_OFFSET = 2;
const ALICE_SESSION_ID = "550e8400-e29b-41d4-a716-446655440000";
const BOB_SESSION_ID = "6ba7b810-9dad-41d6-8bbb-010203040506";

function getRedisRuntime(runtime: ServerRuntime): Extract<ServerRuntime, { kind: "redis" }> {
  if (runtime.kind !== "redis") {
    throw new Error(`Expected redis runtime, received ${runtime.kind}`);
  }
  return runtime;
}

function getRuntimeBaseUrl(runtime: ServerRuntime): string {
  const address = runtime.app.server.address();
  if (!address || typeof address === "string") {
    throw new Error("Runtime did not expose a TCP address");
  }
  return `http://127.0.0.1:${(address as AddressInfo).port}`;
}

function waitForEvent<T>(socket: Socket, event: string, label = event): Promise<T> {
  return new Promise((resolve, reject) => {
    const onEvent = (value: T) => {
      clearTimeout(timer);
      resolve(value);
    };

    const timer = setTimeout(() => {
      socket.off(event, onEvent);
      reject(new Error(`Timed out waiting for ${label}`));
    }, EVENT_TIMEOUT_MS);

    socket.once(event, onEvent);
  });
}

function emitAck<T>(socket: Socket, event: string, payload: unknown): Promise<AckResult<T>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timed out waiting for ack:${event}`));
    }, EVENT_TIMEOUT_MS);

    socket.emit(event, payload, (result: AckResult<T>) => {
      clearTimeout(timer);
      resolve(result);
    });
  });
}

async function waitForCondition(check: () => Promise<boolean>, label: string): Promise<void> {
  const deadline = Date.now() + EVENT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  throw new Error(`Timed out waiting for ${label}`);
}

describe.skipIf(!hasLiveRedisTestUrl())("Redis runtime integration", () => {
  let runtime: Extract<ServerRuntime, { kind: "redis" }> | null = null;
  let baseUrl = "";
  let sockets: Socket[] = [];

  async function connectClient(): Promise<Socket> {
    const socket = io(baseUrl, {
      forceNew: true,
      reconnection: false,
      transports: ["websocket"],
    });
    sockets.push(socket);
    await waitForEvent(socket, "connect", "socket connect");
    return socket;
  }

  beforeEach(async () => {
    await resetLiveRedisDb(RUNTIME_REDIS_DB_OFFSET);

    const redisUrl = getLiveRedisTestUrl(RUNTIME_REDIS_DB_OFFSET);
    if (!redisUrl) {
      throw new Error("REDIS_TEST_URL is required for live Redis runtime tests");
    }

    const created = await createServerRuntime({ kind: "redis", redisUrl });
    runtime = getRedisRuntime(created);
    await runtime.listen({ host: "127.0.0.1", port: 0 });
    baseUrl = getRuntimeBaseUrl(runtime);
  });

  afterEach(async () => {
    for (const socket of sockets) {
      socket.disconnect();
    }
    sockets = [];

    try {
      if (runtime) {
        await runtime.close();
      }
    } finally {
      runtime = null;
      await resetLiveRedisDb(RUNTIME_REDIS_DB_OFFSET);
    }
  });

  it("supports create, join, disconnect, and reconnect with session continuity", async () => {
    const alice = await connectClient();
    const aliceCreatedStatePromise = waitForEvent<PublicRoomState>(
      alice,
      "room_state",
      "alice create room_state"
    );
    const createAck = await emitAck<CreateRoomOutput>(alice, "create_room", {
      sessionId: ALICE_SESSION_ID,
      displayName: "Alice",
      requestedRole: "voter",
    });

    expect(createAck.ok).toBe(true);
    if (!createAck.ok) return;

    const aliceCreatedState = await aliceCreatedStatePromise;
    const { roomId } = createAck.data;
    expect(aliceCreatedState.id).toBe(roomId);
    expect(aliceCreatedState.participants).toHaveLength(1);

    const bob = await connectClient();
    const aliceJoinStatePromise = waitForEvent<PublicRoomState>(alice, "room_state", "alice join room_state");
    const bobJoinStatePromise = waitForEvent<PublicRoomState>(bob, "room_state", "bob join room_state");
    const joinAck = await emitAck<JoinRoomOutput>(bob, "join_room", {
      roomId,
      sessionId: BOB_SESSION_ID,
      displayName: "Bob",
      requestedRole: "voter",
    });

    expect(joinAck.ok).toBe(true);
    if (!joinAck.ok) return;

    const [aliceJoinedState, bobJoinedState] = await Promise.all([
      aliceJoinStatePromise,
      bobJoinStatePromise,
    ]);
    const bobParticipantId = joinAck.data.state.me.participantId;

    expect(bobParticipantId).not.toBeNull();
    expect(aliceJoinedState.participants).toHaveLength(2);
    expect(bobJoinedState.me.participantId).toBe(bobParticipantId);

    const aliceDisconnectStatePromise = waitForEvent<PublicRoomState>(
      alice,
      "room_state",
      "alice sees bob disconnect"
    );
    bob.disconnect();
    const aliceAfterDisconnect = await aliceDisconnectStatePromise;

    expect(
      aliceAfterDisconnect.participants.find((participant) => participant.name === "Bob")?.connected
    ).toBe(false);
    await waitForCondition(async () => {
      const room = await runtime?.roomStore.get(roomId);
      return room?.participants.get(BOB_SESSION_ID)?.connected === false;
    }, "bob disconnect persistence");

    const bobReconnected = await connectClient();
    const aliceReconnectStatePromise = waitForEvent<PublicRoomState>(
      alice,
      "room_state",
      "alice sees bob reconnect"
    );
    const bobReconnectStatePromise = waitForEvent<PublicRoomState>(
      bobReconnected,
      "room_state",
      "bob reconnect room_state"
    );
    const reconnectAck = await emitAck<JoinRoomOutput>(bobReconnected, "join_room", {
      roomId,
      sessionId: BOB_SESSION_ID,
      displayName: "Bob Reconnected",
      requestedRole: "voter",
    });

    expect(reconnectAck.ok).toBe(true);
    if (!reconnectAck.ok) return;

    const [aliceAfterReconnect, bobReconnectState] = await Promise.all([
      aliceReconnectStatePromise,
      bobReconnectStatePromise,
    ]);

    expect(reconnectAck.data.state.me.participantId).toBe(bobParticipantId);
    expect(bobReconnectState.me.participantId).toBe(bobParticipantId);
    expect(
      aliceAfterReconnect.participants.find((participant) => participant.id === bobParticipantId)?.connected
    ).toBe(true);
  });

  it("preserves latest-tab-wins and rejects stale-socket actions", async () => {
    const originalSocket = await connectClient();
    const originalStatePromise = waitForEvent<PublicRoomState>(
      originalSocket,
      "room_state",
      "original create room_state"
    );
    const createAck = await emitAck<CreateRoomOutput>(originalSocket, "create_room", {
      sessionId: ALICE_SESSION_ID,
      displayName: "Alice",
      requestedRole: "voter",
    });

    expect(createAck.ok).toBe(true);
    if (!createAck.ok) return;

    await originalStatePromise;
    const { roomId } = createAck.data;

    const replacementSocket = await connectClient();
    const replacementErrorPromise = waitForEvent<ServerErrorEvent>(
      originalSocket,
      "server_error",
      "session replaced error"
    );
    const replacementStatePromise = waitForEvent<PublicRoomState>(
      replacementSocket,
      "room_state",
      "replacement join room_state"
    );
    const joinAck = await emitAck<JoinRoomOutput>(replacementSocket, "join_room", {
      roomId,
      sessionId: ALICE_SESSION_ID,
      displayName: "Alice",
      requestedRole: "voter",
    });

    expect(joinAck.ok).toBe(true);
    if (!joinAck.ok) return;

    const [replacementError, replacementState] = await Promise.all([
      replacementErrorPromise,
      replacementStatePromise,
    ]);

    expect(replacementError.code).toBe("SESSION_REPLACED");
    expect(replacementState.me.connected).toBe(true);

    const staleVoteAck = await emitAck(originalSocket, "cast_vote", {
      roomId,
      value: "5",
    });

    expect(staleVoteAck.ok).toBe(false);
    if (staleVoteAck.ok) return;
    expect(staleVoteAck.error.code).toBe("SESSION_REPLACED");

    const activeVoteStatePromise = waitForEvent<PublicRoomState>(
      replacementSocket,
      "room_state",
      "replacement cast room_state"
    );
    const activeVoteAck = await emitAck(replacementSocket, "cast_vote", {
      roomId,
      value: "5",
    });

    expect(activeVoteAck.ok).toBe(true);
    if (!activeVoteAck.ok) return;

    const activeVoteState = await activeVoteStatePromise;
    expect(activeVoteState.participants[0]?.hasVoted).toBe(true);
  });

  it("preserves vote, reveal, reset, and next-round semantics", async () => {
    const alice = await connectClient();
    const createdStatePromise = waitForEvent<PublicRoomState>(alice, "room_state", "alice create room_state");
    const createAck = await emitAck<CreateRoomOutput>(alice, "create_room", {
      sessionId: ALICE_SESSION_ID,
      displayName: "Alice",
      requestedRole: "voter",
    });

    expect(createAck.ok).toBe(true);
    if (!createAck.ok) return;
    await createdStatePromise;
    const { roomId } = createAck.data;

    const bob = await connectClient();
    const aliceJoinStatePromise = waitForEvent<PublicRoomState>(alice, "room_state", "alice join room_state");
    const bobJoinStatePromise = waitForEvent<PublicRoomState>(bob, "room_state", "bob join room_state");
    const joinAck = await emitAck<JoinRoomOutput>(bob, "join_room", {
      roomId,
      sessionId: BOB_SESSION_ID,
      displayName: "Bob",
      requestedRole: "voter",
    });

    expect(joinAck.ok).toBe(true);
    if (!joinAck.ok) return;
    await Promise.all([aliceJoinStatePromise, bobJoinStatePromise]);

    const storyStatePromise = waitForEvent<PublicRoomState>(alice, "room_state", "story label");
    const storyAck = await emitAck(alice, "update_story_label", {
      roomId,
      label: "Checkout total",
    });
    expect(storyAck.ok).toBe(true);
    if (!storyAck.ok) return;
    expect((await storyStatePromise).currentStoryLabel).toBe("Checkout total");

    const agendaStatePromise = waitForEvent<PublicRoomState>(alice, "room_state", "agenda add");
    const agendaAck = await emitAck(alice, "add_story_agenda_items", {
      roomId,
      labels: ["Discount code"],
    });
    expect(agendaAck.ok).toBe(true);
    if (!agendaAck.ok) return;
    expect((await agendaStatePromise).storyQueue.map((item) => item.label)).toEqual(["Discount code"]);

    const aliceVoteStatePromise = waitForEvent<PublicRoomState>(alice, "room_state", "alice cast room_state");
    const aliceVoteAck = await emitAck(alice, "cast_vote", { roomId, value: "5" });
    expect(aliceVoteAck.ok).toBe(true);
    if (!aliceVoteAck.ok) return;
    expect(
      (await aliceVoteStatePromise).participants.find((participant) => participant.isSelf)?.hasVoted
    ).toBe(true);

    const bobVoteStatePromise = waitForEvent<PublicRoomState>(alice, "room_state", "bob cast room_state");
    const bobVoteAck = await emitAck(bob, "cast_vote", { roomId, value: "8" });
    expect(bobVoteAck.ok).toBe(true);
    if (!bobVoteAck.ok) return;
    expect((await bobVoteStatePromise).participants.every((participant) => participant.hasVoted)).toBe(true);

    const revealStatePromise = waitForEvent<PublicRoomState>(alice, "room_state", "reveal room_state");
    const revealAck = await emitAck(alice, "reveal_votes", { roomId });
    expect(revealAck.ok).toBe(true);
    if (!revealAck.ok) return;
    const revealedState = await revealStatePromise;
    expect(revealedState.revealed).toBe(true);
    expect(revealedState.sessionRounds[0]?.storyLabel).toBe("Checkout total");
    expect(revealedState.votes).toMatchObject(
      expect.objectContaining({
        [revealedState.participants.find((participant) => participant.name === "Alice")!.id]: "5",
        [revealedState.participants.find((participant) => participant.name === "Bob")!.id]: "8",
      })
    );

    const aliceReopenStatePromise = waitForEvent<PublicRoomState>(alice, "room_state", "reopen alice");
    const bobReopenStatePromise = waitForEvent<PublicRoomState>(bob, "room_state", "reopen bob");
    const reopenAck = await emitAck(alice, "reopen_voting", { roomId });
    expect(reopenAck.ok).toBe(true);
    if (!reopenAck.ok) return;
    const [aliceReopenedState, bobReopenedState] = await Promise.all([
      aliceReopenStatePromise,
      bobReopenStatePromise,
    ]);
    expect(aliceReopenedState.revealed).toBe(false);
    expect(aliceReopenedState.votes).toBeNull();
    expect(aliceReopenedState.me.ownVote).toBe("5");
    expect(bobReopenedState.me.ownVote).toBe("8");
    expect(aliceReopenedState.sessionRounds).toHaveLength(0);

    const rerevealStatePromise = waitForEvent<PublicRoomState>(alice, "room_state", "rereveal room_state");
    const rerevealAck = await emitAck(alice, "reveal_votes", { roomId });
    expect(rerevealAck.ok).toBe(true);
    if (!rerevealAck.ok) return;
    await rerevealStatePromise;

    const resetStatePromise = waitForEvent<PublicRoomState>(alice, "room_state", "reset room_state");
    const resetAck = await emitAck(alice, "reset_round", { roomId });
    expect(resetAck.ok).toBe(true);
    if (!resetAck.ok) return;
    const resetState = await resetStatePromise;
    expect(resetState.revealed).toBe(false);
    expect(resetState.roundNumber).toBe(1);
    expect(resetState.votes).toBeNull();

    const secondAliceVoteStatePromise = waitForEvent<PublicRoomState>(
      alice,
      "room_state",
      "second alice cast"
    );
    const secondAliceVoteAck = await emitAck(alice, "cast_vote", { roomId, value: "13" });
    expect(secondAliceVoteAck.ok).toBe(true);
    if (!secondAliceVoteAck.ok) return;
    await secondAliceVoteStatePromise;

    const secondBobVoteStatePromise = waitForEvent<PublicRoomState>(alice, "room_state", "second bob cast");
    const secondBobVoteAck = await emitAck(bob, "cast_vote", { roomId, value: "21" });
    expect(secondBobVoteAck.ok).toBe(true);
    if (!secondBobVoteAck.ok) return;
    await secondBobVoteStatePromise;

    const secondRevealStatePromise = waitForEvent<PublicRoomState>(alice, "room_state", "second reveal");
    const secondRevealAck = await emitAck(alice, "reveal_votes", { roomId });
    expect(secondRevealAck.ok).toBe(true);
    if (!secondRevealAck.ok) return;
    await secondRevealStatePromise;

    const nextRoundStatePromise = waitForEvent<PublicRoomState>(alice, "room_state", "next round");
    const nextRoundAck = await emitAck(alice, "next_round", { roomId });
    expect(nextRoundAck.ok).toBe(true);
    if (!nextRoundAck.ok) return;
    const nextRoundState = await nextRoundStatePromise;
    expect(nextRoundState.revealed).toBe(false);
    expect(nextRoundState.roundNumber).toBe(2);
    expect(nextRoundState.currentStoryLabel).toBeNull();
    expect(nextRoundState.storyQueue.map((item) => item.label)).toEqual(["Discount code"]);
    expect(nextRoundState.votes).toBeNull();

    const startNextStoryStatePromise = waitForEvent<PublicRoomState>(alice, "room_state", "start next story");
    const startNextStoryAck = await emitAck(alice, "start_next_story", { roomId });
    expect(startNextStoryAck.ok).toBe(true);
    if (!startNextStoryAck.ok) return;
    const startNextStoryState = await startNextStoryStatePromise;
    expect(startNextStoryState.roundNumber).toBe(3);
    expect(startNextStoryState.currentStoryLabel).toBe("Discount code");
    expect(startNextStoryState.storyQueue).toHaveLength(0);
  });

  it("supports moderator transfer and moves moderator-only permissions immediately", async () => {
    const alice = await connectClient();
    const createdStatePromise = waitForEvent<PublicRoomState>(alice, "room_state", "alice create room_state");
    const createAck = await emitAck<CreateRoomOutput>(alice, "create_room", {
      sessionId: ALICE_SESSION_ID,
      displayName: "Alice",
      requestedRole: "voter",
    });

    expect(createAck.ok).toBe(true);
    if (!createAck.ok) return;
    await createdStatePromise;
    const { roomId } = createAck.data;

    const bob = await connectClient();
    const aliceJoinStatePromise = waitForEvent<PublicRoomState>(alice, "room_state", "alice join room_state");
    const bobJoinStatePromise = waitForEvent<PublicRoomState>(bob, "room_state", "bob join room_state");
    const joinAck = await emitAck<JoinRoomOutput>(bob, "join_room", {
      roomId,
      sessionId: BOB_SESSION_ID,
      displayName: "Bob",
      requestedRole: "voter",
    });

    expect(joinAck.ok).toBe(true);
    if (!joinAck.ok) return;
    await Promise.all([aliceJoinStatePromise, bobJoinStatePromise]);

    const bobParticipantId = joinAck.data.state.me.participantId;
    expect(bobParticipantId).not.toBeNull();

    const transferStatePromise = waitForEvent<PublicRoomState>(alice, "room_state", "transfer room_state");
    const transferAck = await emitAck(alice, "transfer_moderator", {
      roomId,
      targetParticipantId: bobParticipantId,
    });

    expect(transferAck.ok).toBe(true);
    if (!transferAck.ok) return;
    const transferredState = await transferStatePromise;
    expect(
      transferredState.participants.find((participant) => participant.id === bobParticipantId)?.isModerator
    ).toBe(true);

    const oldModeratorReveal = await emitAck(alice, "reveal_votes", { roomId });
    expect(oldModeratorReveal.ok).toBe(false);
    if (oldModeratorReveal.ok) return;
    expect(oldModeratorReveal.error.code).toBe("NOT_ALLOWED");

    const newModeratorStatePromise = waitForEvent<PublicRoomState>(bob, "room_state", "new moderator reveal");
    const newModeratorReveal = await emitAck(bob, "reveal_votes", { roomId });
    expect(newModeratorReveal.ok).toBe(true);
    if (!newModeratorReveal.ok) return;
    await newModeratorStatePromise;
  });

  it("persists settings for reconnects within the room lifetime", async () => {
    const alice = await connectClient();
    const createdStatePromise = waitForEvent<PublicRoomState>(alice, "room_state", "alice create room_state");
    const createAck = await emitAck<CreateRoomOutput>(alice, "create_room", {
      sessionId: ALICE_SESSION_ID,
      displayName: "Alice",
      requestedRole: "voter",
    });

    expect(createAck.ok).toBe(true);
    if (!createAck.ok) return;
    await createdStatePromise;
    const { roomId } = createAck.data;

    const updateStatePromise = waitForEvent<PublicRoomState>(
      alice,
      "room_state",
      "settings update room_state"
    );
    const updateAck = await emitAck(alice, "update_settings", {
      roomId,
      settings: {
        allowNameChange: false,
        allowSelfRoleSwitch: false,
        allowSpectators: false,
        revealPolicy: "anyone",
        resetPolicy: "anyone",
        deckChangePolicy: "anyone",
      },
    });

    expect(updateAck.ok).toBe(true);
    if (!updateAck.ok) return;
    const updatedState = await updateStatePromise;
    expect(updatedState.settings.allowNameChange).toBe(false);
    expect(updatedState.settings.revealPolicy).toBe("anyone");

    const storedRoom = await runtime?.roomStore.get(roomId);
    expect(storedRoom?.settings.allowSelfRoleSwitch).toBe(false);
    expect(storedRoom?.settings.allowSpectators).toBe(false);

    alice.disconnect();
    await waitForCondition(async () => {
      const room = await runtime?.roomStore.get(roomId);
      return room?.participants.get(ALICE_SESSION_ID)?.connected === false;
    }, "alice disconnect persistence");

    const aliceReconnected = await connectClient();
    const reconnectStatePromise = waitForEvent<PublicRoomState>(
      aliceReconnected,
      "room_state",
      "alice reconnect room_state"
    );
    const reconnectAck = await emitAck<JoinRoomOutput>(aliceReconnected, "join_room", {
      roomId,
      sessionId: ALICE_SESSION_ID,
      displayName: "Alice",
      requestedRole: "voter",
    });

    expect(reconnectAck.ok).toBe(true);
    if (!reconnectAck.ok) return;
    const reconnectState = await reconnectStatePromise;
    expect(reconnectState.settings.allowNameChange).toBe(false);
    expect(reconnectState.settings.allowSelfRoleSwitch).toBe(false);
    expect(reconnectState.settings.allowSpectators).toBe(false);
    expect(reconnectState.settings.deckChangePolicy).toBe("anyone");
  });

  it("cleans stale disconnected participants and expires empty rooms coherently", async () => {
    const alice = await connectClient();
    const createdStatePromise = waitForEvent<PublicRoomState>(alice, "room_state", "alice create room_state");
    const createAck = await emitAck<CreateRoomOutput>(alice, "create_room", {
      sessionId: ALICE_SESSION_ID,
      displayName: "Alice",
      requestedRole: "voter",
    });

    expect(createAck.ok).toBe(true);
    if (!createAck.ok) return;
    await createdStatePromise;
    const { roomId } = createAck.data;

    const bob = await connectClient();
    const aliceJoinStatePromise = waitForEvent<PublicRoomState>(alice, "room_state", "alice join room_state");
    const bobJoinStatePromise = waitForEvent<PublicRoomState>(bob, "room_state", "bob join room_state");
    const joinAck = await emitAck<JoinRoomOutput>(bob, "join_room", {
      roomId,
      sessionId: BOB_SESSION_ID,
      displayName: "Bob",
      requestedRole: "voter",
    });

    expect(joinAck.ok).toBe(true);
    if (!joinAck.ok) return;
    await Promise.all([aliceJoinStatePromise, bobJoinStatePromise]);

    const bobVoteStatePromise = waitForEvent<PublicRoomState>(alice, "room_state", "bob vote room_state");
    const bobVoteAck = await emitAck(bob, "cast_vote", { roomId, value: "8" });
    expect(bobVoteAck.ok).toBe(true);
    if (!bobVoteAck.ok) return;
    await bobVoteStatePromise;

    const aliceDisconnectStatePromise = waitForEvent<PublicRoomState>(
      alice,
      "room_state",
      "alice sees bob disconnect"
    );
    bob.disconnect();
    await aliceDisconnectStatePromise;

    const roomBeforeCleanup = await runtime?.roomStore.get(roomId);
    expect(roomBeforeCleanup).toBeDefined();
    if (!roomBeforeCleanup) return;

    const bobParticipant = roomBeforeCleanup.participants.get(BOB_SESSION_ID);
    expect(bobParticipant).toBeDefined();
    if (!bobParticipant) return;

    bobParticipant.lastSeenAt = Date.now() - DISCONNECTED_PARTICIPANT_GRACE_MS - 1;
    await runtime?.roomStore.save(roomBeforeCleanup);
    await runtime?.runCleanupOnce();

    const roomAfterParticipantCleanup = await runtime?.roomStore.get(roomId);
    expect(roomAfterParticipantCleanup?.participants.has(BOB_SESSION_ID)).toBe(false);
    expect(roomAfterParticipantCleanup?.votes.has(bobParticipant.id)).toBe(false);

    alice.disconnect();
    await waitForCondition(async () => {
      const room = await runtime?.roomStore.get(roomId);
      return room?.participants.get(ALICE_SESSION_ID)?.connected === false;
    }, "alice disconnect persistence");

    const expiredRoom = await runtime?.roomStore.get(roomId);
    expect(expiredRoom).toBeDefined();
    if (!expiredRoom) return;

    const aliceParticipant = expiredRoom.participants.get(ALICE_SESSION_ID);
    expect(aliceParticipant).toBeDefined();
    if (!aliceParticipant) return;

    aliceParticipant.lastSeenAt = Date.now() - DISCONNECTED_PARTICIPANT_GRACE_MS - 1;
    expiredRoom.expiresAt = Date.now() - 1;
    await runtime?.roomStore.save(expiredRoom);
    await runtime?.runCleanupOnce();

    expect(await runtime?.roomStore.get(roomId)).toBeUndefined();
  });
});
