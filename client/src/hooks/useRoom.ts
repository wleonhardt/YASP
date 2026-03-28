import { useState, useEffect } from "react";
import type { Socket } from "socket.io-client";
import type {
  PublicRoomState,
  AckResult,
  ServerErrorEvent,
  ParticipantRole,
} from "@yasp/shared";
import type {
  CreateRoomOutput,
  JoinRoomOutput,
  DeckInput,
} from "@yasp/shared";

export function useRoom(socket: Socket, sessionId: string) {
  const [roomState, setRoomState] = useState<PublicRoomState | null>(null);
  const [error, setError] = useState<ServerErrorEvent | null>(null);
  const [sessionReplaced, setSessionReplaced] = useState(false);

  useEffect(() => {
    const onRoomState = (state: PublicRoomState) => {
      setRoomState(state);
      setError(null);
    };

    const onServerError = (err: ServerErrorEvent) => {
      if (err.code === "SESSION_REPLACED") {
        setSessionReplaced(true);
      }
      setError(err);
    };

    socket.on("room_state", onRoomState);
    socket.on("server_error", onServerError);

    return () => {
      socket.off("room_state", onRoomState);
      socket.off("server_error", onServerError);
    };
  }, [socket]);

  function surfaceAckError<T>(result: AckResult<T>): AckResult<T> {
    if (!result.ok) {
      if (result.error.code === "SESSION_REPLACED") {
        setSessionReplaced(true);
      }
      setError(result.error);
    }
    return result;
  }

  function emitAck<T = undefined>(event: string, payload: unknown): Promise<AckResult<T>> {
    return new Promise((resolve) => {
      socket.emit(event, payload, (result: AckResult<T>) => {
        resolve(surfaceAckError(result));
      });
    });
  }

  async function createRoom(
    displayName: string,
    role: ParticipantRole,
    deck?: DeckInput
  ): Promise<AckResult<CreateRoomOutput>> {
    return emitAck<CreateRoomOutput>("create_room", {
      sessionId,
      displayName,
      requestedRole: role,
      deck,
    });
  }

  async function joinRoom(
    roomId: string,
    displayName: string,
    role: ParticipantRole
  ): Promise<AckResult<JoinRoomOutput>> {
    setSessionReplaced(false);
    return emitAck<JoinRoomOutput>("join_room", {
      roomId,
      sessionId,
      displayName,
      requestedRole: role,
    });
  }

  async function leaveRoom(roomId: string): Promise<AckResult> {
    return emitAck("leave_room", { roomId });
  }

  async function castVote(roomId: string, value: string): Promise<AckResult> {
    return emitAck("cast_vote", { roomId, value });
  }

  async function clearVote(roomId: string): Promise<AckResult> {
    return emitAck("clear_vote", { roomId });
  }

  async function revealVotes(roomId: string): Promise<AckResult> {
    return emitAck("reveal_votes", { roomId });
  }

  async function resetRound(roomId: string): Promise<AckResult> {
    return emitAck("reset_round", { roomId });
  }

  async function nextRound(roomId: string): Promise<AckResult> {
    return emitAck("next_round", { roomId });
  }

  async function transferModerator(
    roomId: string,
    targetParticipantId: string
  ): Promise<AckResult> {
    return emitAck("transfer_moderator", { roomId, targetParticipantId });
  }

  return {
    roomState,
    error,
    sessionReplaced,
    createRoom,
    joinRoom,
    leaveRoom,
    castVote,
    clearVote,
    revealVotes,
    resetRound,
    nextRound,
    transferModerator,
  };
}
