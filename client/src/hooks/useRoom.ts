import { useState, useEffect, useCallback } from "react";
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
import type { RoomSettings } from "@yasp/shared";

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

  /** Surface ack failures into the error banner. */
  function surfaceAckError<T>(result: AckResult<T>): AckResult<T> {
    if (!result.ok) {
      if (result.error.code === "SESSION_REPLACED") {
        setSessionReplaced(true);
      }
      setError(result.error);
    }
    return result;
  }

  const createRoom = useCallback(
    async (displayName: string, role: ParticipantRole, deck?: DeckInput): Promise<AckResult<CreateRoomOutput>> => {
      return new Promise((resolve) => {
        socket.emit(
          "create_room",
          { sessionId, displayName, requestedRole: role, deck },
          (res: AckResult<CreateRoomOutput>) => resolve(surfaceAckError(res))
        );
      });
    },
    [socket, sessionId]
  );

  const joinRoom = useCallback(
    async (roomId: string, displayName: string, role: ParticipantRole): Promise<AckResult<JoinRoomOutput>> => {
      setSessionReplaced(false);
      return new Promise((resolve) => {
        socket.emit(
          "join_room",
          { roomId, sessionId, displayName, requestedRole: role },
          (res: AckResult<JoinRoomOutput>) => resolve(surfaceAckError(res))
        );
      });
    },
    [socket, sessionId]
  );

  const leaveRoom = useCallback(
    async (roomId: string): Promise<AckResult> => {
      return new Promise((resolve) => {
        socket.emit("leave_room", { roomId }, (res: AckResult) => resolve(surfaceAckError(res)));
      });
    },
    [socket]
  );

  const castVote = useCallback(
    async (roomId: string, value: string): Promise<AckResult> => {
      return new Promise((resolve) => {
        socket.emit("cast_vote", { roomId, value }, (res: AckResult) => resolve(surfaceAckError(res)));
      });
    },
    [socket]
  );

  const clearVote = useCallback(
    async (roomId: string): Promise<AckResult> => {
      return new Promise((resolve) => {
        socket.emit("clear_vote", { roomId }, (res: AckResult) => resolve(surfaceAckError(res)));
      });
    },
    [socket]
  );

  const revealVotes = useCallback(
    async (roomId: string): Promise<AckResult> => {
      return new Promise((resolve) => {
        socket.emit("reveal_votes", { roomId }, (res: AckResult) => resolve(surfaceAckError(res)));
      });
    },
    [socket]
  );

  const resetRound = useCallback(
    async (roomId: string): Promise<AckResult> => {
      return new Promise((resolve) => {
        socket.emit("reset_round", { roomId }, (res: AckResult) => resolve(surfaceAckError(res)));
      });
    },
    [socket]
  );

  const nextRound = useCallback(
    async (roomId: string): Promise<AckResult> => {
      return new Promise((resolve) => {
        socket.emit("next_round", { roomId }, (res: AckResult) => resolve(surfaceAckError(res)));
      });
    },
    [socket]
  );

  const transferModerator = useCallback(
    async (roomId: string, targetParticipantId: string): Promise<AckResult> => {
      return new Promise((resolve) => {
        socket.emit(
          "transfer_moderator",
          { roomId, targetParticipantId },
          (res: AckResult) => resolve(surfaceAckError(res))
        );
      });
    },
    [socket]
  );

  const changeName = useCallback(
    async (roomId: string, name: string): Promise<AckResult> => {
      return new Promise((resolve) => {
        socket.emit("change_name", { roomId, name }, (res: AckResult) => resolve(surfaceAckError(res)));
      });
    },
    [socket]
  );

  const changeRole = useCallback(
    async (roomId: string, role: ParticipantRole): Promise<AckResult> => {
      return new Promise((resolve) => {
        socket.emit("change_role", { roomId, role }, (res: AckResult) => resolve(surfaceAckError(res)));
      });
    },
    [socket]
  );

  const changeDeck = useCallback(
    async (roomId: string, deck: DeckInput): Promise<AckResult> => {
      return new Promise((resolve) => {
        socket.emit("change_deck", { roomId, deck }, (res: AckResult) => resolve(surfaceAckError(res)));
      });
    },
    [socket]
  );

  const updateSettings = useCallback(
    async (roomId: string, settings: Partial<RoomSettings>): Promise<AckResult> => {
      return new Promise((resolve) => {
        socket.emit("update_settings", { roomId, settings }, (res: AckResult) => resolve(surfaceAckError(res)));
      });
    },
    [socket]
  );

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
    changeName,
    changeRole,
    changeDeck,
    updateSettings,
  };
}
