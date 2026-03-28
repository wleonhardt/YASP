import { useCallback, useEffect, useState } from "react";
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

  const surfaceAckError = useCallback(<T,>(result: AckResult<T>): AckResult<T> => {
    if (!result.ok) {
      if (result.error.code === "SESSION_REPLACED") {
        setSessionReplaced(true);
      }
      setError(result.error);
    }
    return result;
  }, []);

  const emitAck = useCallback(<T = undefined,>(
    event: string,
    payload: unknown
  ): Promise<AckResult<T>> => {
    return new Promise((resolve) => {
      socket.emit(event, payload, (result: AckResult<T>) => {
        resolve(surfaceAckError(result));
      });
    });
  }, [socket, surfaceAckError]);

  const createRoom = useCallback(async (
    displayName: string,
    role: ParticipantRole,
    deck?: DeckInput
  ): Promise<AckResult<CreateRoomOutput>> => {
    return emitAck<CreateRoomOutput>("create_room", {
      sessionId,
      displayName,
      requestedRole: role,
      deck,
    });
  }, [emitAck, sessionId]);

  const joinRoom = useCallback(async (
    roomId: string,
    displayName: string,
    role: ParticipantRole
  ): Promise<AckResult<JoinRoomOutput>> => {
    setSessionReplaced(false);
    return emitAck<JoinRoomOutput>("join_room", {
      roomId,
      sessionId,
      displayName,
      requestedRole: role,
    });
  }, [emitAck, sessionId]);

  const leaveRoom = useCallback(async (roomId: string): Promise<AckResult> => {
    return emitAck("leave_room", { roomId });
  }, [emitAck]);

  const castVote = useCallback(async (roomId: string, value: string): Promise<AckResult> => {
    return emitAck("cast_vote", { roomId, value });
  }, [emitAck]);

  const clearVote = useCallback(async (roomId: string): Promise<AckResult> => {
    return emitAck("clear_vote", { roomId });
  }, [emitAck]);

  const revealVotes = useCallback(async (roomId: string): Promise<AckResult> => {
    return emitAck("reveal_votes", { roomId });
  }, [emitAck]);

  const resetRound = useCallback(async (roomId: string): Promise<AckResult> => {
    return emitAck("reset_round", { roomId });
  }, [emitAck]);

  const nextRound = useCallback(async (roomId: string): Promise<AckResult> => {
    return emitAck("next_round", { roomId });
  }, [emitAck]);

  const transferModerator = useCallback(async (
    roomId: string,
    targetParticipantId: string
  ): Promise<AckResult> => {
    return emitAck("transfer_moderator", { roomId, targetParticipantId });
  }, [emitAck]);

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
