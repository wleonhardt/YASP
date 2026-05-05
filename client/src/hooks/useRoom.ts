import { useCallback, useEffect, useState } from "react";
import type { Socket } from "socket.io-client";
import type {
  PublicRoomState,
  AckResult,
  ServerErrorEvent,
  ParticipantRole,
  RoomSettings,
} from "@yasp/shared";
import type { CreateRoomOutput, JoinRoomOutput, DeckInput } from "@yasp/shared";

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

  const surfaceAckError = useCallback(<T>(result: AckResult<T>): AckResult<T> => {
    if (!result.ok) {
      if (result.error.code === "SESSION_REPLACED") {
        setSessionReplaced(true);
      }
      setError(result.error);
    }
    return result;
  }, []);

  const emitAck = useCallback(
    <T = undefined>(event: string, payload: unknown): Promise<AckResult<T>> => {
      return new Promise((resolve) => {
        socket.emit(event, payload, (result: AckResult<T>) => {
          resolve(surfaceAckError(result));
        });
      });
    },
    [socket, surfaceAckError]
  );

  const createRoom = useCallback(
    async (
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
    },
    [emitAck, sessionId]
  );

  const joinRoom = useCallback(
    async (
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
    },
    [emitAck, sessionId]
  );

  const leaveRoom = useCallback(
    async (roomId: string): Promise<AckResult> => {
      return emitAck("leave_room", { roomId });
    },
    [emitAck]
  );

  const castVote = useCallback(
    async (roomId: string, value: string): Promise<AckResult> => {
      return emitAck("cast_vote", { roomId, value });
    },
    [emitAck]
  );

  const clearVote = useCallback(
    async (roomId: string): Promise<AckResult> => {
      return emitAck("clear_vote", { roomId });
    },
    [emitAck]
  );

  const revealVotes = useCallback(
    async (roomId: string): Promise<AckResult> => {
      return emitAck("reveal_votes", { roomId });
    },
    [emitAck]
  );

  const resetRound = useCallback(
    async (roomId: string): Promise<AckResult> => {
      return emitAck("reset_round", { roomId });
    },
    [emitAck]
  );

  const reopenVoting = useCallback(
    async (roomId: string): Promise<AckResult> => {
      return emitAck("reopen_voting", { roomId });
    },
    [emitAck]
  );

  const nextRound = useCallback(
    async (roomId: string): Promise<AckResult> => {
      return emitAck("next_round", { roomId });
    },
    [emitAck]
  );

  const updateStoryLabel = useCallback(
    async (roomId: string, label: string): Promise<AckResult> => {
      return emitAck("update_story_label", { roomId, label });
    },
    [emitAck]
  );

  const addStoryAgendaItems = useCallback(
    async (roomId: string, labels: string[]): Promise<AckResult> => {
      return emitAck("add_story_agenda_items", { roomId, labels });
    },
    [emitAck]
  );

  const removeStoryAgendaItem = useCallback(
    async (roomId: string, itemId: string): Promise<AckResult> => {
      return emitAck("remove_story_agenda_item", { roomId, itemId });
    },
    [emitAck]
  );

  const moveStoryAgendaItem = useCallback(
    async (roomId: string, itemId: string, direction: "up" | "down"): Promise<AckResult> => {
      return emitAck("move_story_agenda_item", { roomId, itemId, direction });
    },
    [emitAck]
  );

  const startNextStory = useCallback(
    async (roomId: string): Promise<AckResult> => {
      return emitAck("start_next_story", { roomId });
    },
    [emitAck]
  );

  const transferModerator = useCallback(
    async (roomId: string, targetParticipantId: string): Promise<AckResult> => {
      return emitAck("transfer_moderator", { roomId, targetParticipantId });
    },
    [emitAck]
  );

  const setTimerDuration = useCallback(
    async (roomId: string, durationSeconds: number): Promise<AckResult> => {
      return emitAck("set_timer_duration", { roomId, durationSeconds });
    },
    [emitAck]
  );

  const startTimer = useCallback(
    async (roomId: string): Promise<AckResult> => {
      return emitAck("start_timer", { roomId });
    },
    [emitAck]
  );

  const pauseTimer = useCallback(
    async (roomId: string): Promise<AckResult> => {
      return emitAck("pause_timer", { roomId });
    },
    [emitAck]
  );

  const resetTimer = useCallback(
    async (roomId: string): Promise<AckResult> => {
      return emitAck("reset_timer", { roomId });
    },
    [emitAck]
  );

  const honkTimer = useCallback(
    async (roomId: string): Promise<AckResult> => {
      return emitAck("honk_timer", { roomId });
    },
    [emitAck]
  );

  const updateSettings = useCallback(
    async (roomId: string, settings: Partial<RoomSettings>): Promise<AckResult> => {
      return emitAck("update_settings", { roomId, settings });
    },
    [emitAck]
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
    reopenVoting,
    nextRound,
    updateStoryLabel,
    addStoryAgendaItems,
    removeStoryAgendaItem,
    moveStoryAgendaItem,
    startNextStory,
    transferModerator,
    setTimerDuration,
    startTimer,
    pauseTimer,
    resetTimer,
    honkTimer,
    updateSettings,
  };
}
