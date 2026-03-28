import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import type { ParticipantRole } from "@yasp/shared";
import { Banner } from "../components/Banner";
import { ConnectionBadge } from "../components/ConnectionBadge";
import { ModeratorControls } from "../components/ModeratorControls";
import { ParticipantsBoard } from "../components/ParticipantsBoard";
import { ResultsPanel } from "../components/ResultsPanel";
import { Toast, type ToastState } from "../components/Toast";
import { TopBar } from "../components/TopBar";
import { VoteDeck } from "../components/VoteDeck";
import { useRoom } from "../hooks/useRoom";
import { useSession } from "../hooks/useSession";
import { useSocket } from "../hooks/useSocket";
import { getSelf } from "../lib/room";
import { getStoredDisplayName, getStoredRole, setStoredDisplayName, setStoredRole } from "../lib/storage";

type RoomUnavailableReason = "ROOM_NOT_FOUND" | "ROOM_EXPIRED";

export function RoomPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { socket, status } = useSocket();
  const { sessionId, storedName } = useSession();
  const {
    roomState,
    error,
    sessionReplaced,
    joinRoom,
    leaveRoom,
    castVote,
    clearVote,
    revealVotes,
    resetRound,
    nextRound,
    transferModerator,
  } = useRoom(socket, sessionId);

  const [selectedCard, setSelectedCard] = useState<string | null>(null);
  const [needsManualJoin, setNeedsManualJoin] = useState(false);
  const [joinName, setJoinName] = useState(storedName || "");
  const [joinRole, setJoinRole] = useState<ParticipantRole>("voter");
  const [toast, setToast] = useState<ToastState | null>(null);
  const [roomUnavailable, setRoomUnavailable] = useState<RoomUnavailableReason | null>(null);

  const autoJoinAttempted = useRef(false);
  const lastConnectedStatus = useRef(status);
  const lastErrorKey = useRef<string | null>(null);
  const toastTimeout = useRef<number | null>(null);

  const navState = location.state as { role?: ParticipantRole } | null;

  const checkRoomUnavailable = useCallback((result: { ok: false; error: { code: string } }): void => {
    if (result.error.code === "ROOM_NOT_FOUND" || result.error.code === "ROOM_EXPIRED") {
      setRoomUnavailable(result.error.code as RoomUnavailableReason);
    }
  }, []);

  const showToast = useCallback((intent: ToastState["intent"], message: string) => {
    if (toastTimeout.current !== null) {
      window.clearTimeout(toastTimeout.current);
    }

    setToast({ intent, message });
    toastTimeout.current = window.setTimeout(() => setToast(null), 2800);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimeout.current !== null) {
        window.clearTimeout(toastTimeout.current);
      }
    };
  }, []);

  const getIntendedRole = useCallback((): ParticipantRole => {
    if (navState?.role) {
      return navState.role;
    }

    return getStoredRole() ?? "voter";
  }, [navState]);

  useEffect(() => {
    if (status !== "connected" || !roomId) {
      return;
    }

    const wasDisconnected = lastConnectedStatus.current !== "connected";
    lastConnectedStatus.current = status;

    if (roomState && wasDisconnected) {
      const self = getSelf(roomState);
      const name = getStoredDisplayName() || self?.name || "Anonymous";
      const role = self?.role ?? getIntendedRole();

      joinRoom(roomId, name, role).then((result) => {
        if (!result.ok) checkRoomUnavailable(result);
      });

      return;
    }

    if (!autoJoinAttempted.current) {
      autoJoinAttempted.current = true;
      const name = getStoredDisplayName();

      if (name) {
        const role = getIntendedRole();
        joinRoom(roomId, name, role).then((result) => {
          if (!result.ok) {
            checkRoomUnavailable(result);
            if (!result.error.code.startsWith("ROOM_")) setNeedsManualJoin(true);
          }
        });
      } else {
        setNeedsManualJoin(true);
      }
    }
  }, [checkRoomUnavailable, getIntendedRole, joinRoom, roomId, roomState, status]);

  useEffect(() => {
    if (status !== "connected") {
      lastConnectedStatus.current = status;
    }
  }, [status]);

  useEffect(() => {
    if (!roomState) {
      return;
    }

    const self = getSelf(roomState);
    if (!self) {
      return;
    }

    if (roomState.revealed && roomState.votes) {
      setSelectedCard(roomState.votes[self.id] ?? null);
    } else if (!roomState.revealed && !self.hasVoted) {
      setSelectedCard(null);
    }
  }, [roomState]);

  useEffect(() => {
    if (!error) return;

    if (error.code === "ROOM_NOT_FOUND" || error.code === "ROOM_EXPIRED") {
      setRoomUnavailable(error.code);
      return;
    }

    if (error.code === "SESSION_REPLACED" || error.code === "NOT_ALLOWED") {
      return;
    }

    const errorKey = `${error.code}:${error.message}`;
    if (lastErrorKey.current === errorKey) {
      return;
    }

    lastErrorKey.current = errorKey;
    showToast("error", error.message);
  }, [error, showToast]);

  const actionsDisabled = sessionReplaced;

  const handleRejoin = useCallback(async () => {
    if (!roomId || status !== "connected") {
      return;
    }

    const name = getStoredDisplayName() || storedName || "Anonymous";
    const role = getIntendedRole();
    await joinRoom(roomId, name, role);
  }, [getIntendedRole, joinRoom, roomId, status, storedName]);

  const handleCloseTab = () => {
    window.close();
    window.setTimeout(() => navigate("/"), 120);
  };

  const handleManualJoin = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      if (!roomId || !joinName.trim() || status !== "connected") {
        return;
      }

      setStoredDisplayName(joinName.trim());
      setStoredRole(joinRole);
      const result = await joinRoom(roomId, joinName.trim(), joinRole);

      if (result.ok) {
        setNeedsManualJoin(false);
        return;
      }

      checkRoomUnavailable(result);
    },
    [checkRoomUnavailable, joinName, joinRole, joinRoom, roomId, status]
  );

  const handleVote = useCallback(
    async (value: string) => {
      if (!roomId || actionsDisabled) {
        return;
      }

      setSelectedCard(value);
      const result = await castVote(roomId, value);
      if (!result.ok) {
        setSelectedCard(null);
      }
    },
    [actionsDisabled, castVote, roomId]
  );

  const handleClearVote = useCallback(async () => {
    if (!roomId || actionsDisabled) {
      return;
    }

    setSelectedCard(null);
    await clearVote(roomId);
  }, [actionsDisabled, clearVote, roomId]);

  const handleReveal = useCallback(async () => {
    if (!roomId || actionsDisabled) {
      return;
    }

    await revealVotes(roomId);
  }, [actionsDisabled, revealVotes, roomId]);

  const handleReset = useCallback(async () => {
    if (!roomId || actionsDisabled) {
      return;
    }

    const result = await resetRound(roomId);
    if (result.ok) {
      setSelectedCard(null);
    }
  }, [actionsDisabled, resetRound, roomId]);

  const handleNextRound = useCallback(async () => {
    if (!roomId || actionsDisabled) {
      return;
    }

    const result = await nextRound(roomId);
    if (result.ok) {
      setSelectedCard(null);
    }
  }, [actionsDisabled, nextRound, roomId]);

  const handleTransferModerator = useCallback(
    async (targetParticipantId: string) => {
      if (!roomId || actionsDisabled) {
        return false;
      }

      const result = await transferModerator(roomId, targetParticipantId);
      return result.ok;
    },
    [actionsDisabled, roomId, transferModerator]
  );

  const handleLeave = useCallback(async () => {
    if (!roomId || actionsDisabled) {
      return;
    }

    await leaveRoom(roomId);
    navigate("/");
  }, [actionsDisabled, leaveRoom, navigate, roomId]);

  useEffect(() => {
    if (!roomState || actionsDisabled || status !== "connected") {
      return;
    }

    const self = getSelf(roomState);
    if (!self || self.role !== "voter" || roomState.revealed) {
      return;
    }

    const availableCards = new Set(roomState.deck.cards);

    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target instanceof HTMLInputElement ||
          target instanceof HTMLTextAreaElement ||
          target instanceof HTMLSelectElement ||
          target.isContentEditable)
      ) {
        return;
      }

      if (event.key === "Escape" && selectedCard) {
        event.preventDefault();
        void handleClearVote();
        return;
      }

      if (availableCards.has(event.key)) {
        event.preventDefault();
        if (selectedCard === event.key) {
          void handleClearVote();
        } else {
          void handleVote(event.key);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [actionsDisabled, handleClearVote, handleVote, roomState, selectedCard, status]);

  if (roomUnavailable) {
    return (
      <div className="page-shell page-shell--centered">
        <div className="status-corner">
          <ConnectionBadge status={status} />
        </div>

        <section className="app-panel empty-state">
          <div className="section-label">Room unavailable</div>
          <h1>Rooms are temporary. This room no longer exists.</h1>
          <p>
            {roomUnavailable === "ROOM_EXPIRED"
              ? "The room expired after inactivity."
              : "It may have been closed or restarted."}
          </p>
          <button className="button button--primary" type="button" onClick={() => navigate("/")}>
            Create a new room
          </button>
        </section>
      </div>
    );
  }

  if (needsManualJoin && !roomState) {
    return (
      <div className="page-shell page-shell--centered">
        <div className="status-corner">
          <ConnectionBadge status={status} />
        </div>

        <form className="app-panel empty-state empty-state--form" onSubmit={handleManualJoin}>
          <div className="section-label">Manual join</div>
          <h1>Join room {roomId}</h1>
          <p>We couldn’t auto-join this tab. Enter your name and role to continue.</p>

          <label className="field">
            <span className="field__label">Display name</span>
            <input
              className="input"
              type="text"
              value={joinName}
              onChange={(event) => setJoinName(event.target.value)}
              placeholder="Enter your display name"
              maxLength={30}
            />
          </label>

          <div className="field">
            <span className="field__label">Role</span>
            <div className="segmented">
              {(["voter", "spectator"] as ParticipantRole[]).map((roleOption) => (
                <button
                  key={roleOption}
                  type="button"
                  className={["segmented__option", joinRole === roleOption ? "segmented__option--active" : ""]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={() => setJoinRole(roleOption)}
                >
                  <span>{roleOption === "voter" ? "Voter" : "Spectator"}</span>
                  <small>{roleOption === "voter" ? "Choose a card" : "Watch only"}</small>
                </button>
              ))}
            </div>
          </div>

          <button
            className="button button--primary button--full"
            type="submit"
            disabled={!joinName.trim() || status !== "connected"}
          >
            Join room
          </button>
        </form>

        <Toast toast={toast} />
      </div>
    );
  }

  if (!roomState) {
    return (
      <div className="page-shell page-shell--centered">
        <div className="status-corner">
          <ConnectionBadge status={status} />
        </div>
        <section className="app-panel empty-state">
          <div className="section-label">Connecting</div>
          <h1>Joining room…</h1>
          <p>Waiting for the latest room snapshot.</p>
        </section>
      </div>
    );
  }

  const state = roomState;

  return (
    <div className="page-shell room-page">
      <TopBar
        state={state}
        connectionStatus={status}
        onLeave={handleLeave}
        onCopyFeedback={showToast}
        disabled={actionsDisabled}
      />

      {status !== "connected" && (
        <Banner
          tone={status === "connecting" ? "info" : "error"}
          title={status === "connecting" ? "Reconnecting…" : "Disconnected"}
        >
          Trying to reconnect. If this persists, refresh.
        </Banner>
      )}

      {error?.code === "NOT_ALLOWED" && (
        <Banner tone="warning" title="Action blocked">
          {error.message}
        </Banner>
      )}

      {sessionReplaced && (
        <section className="app-panel session-panel">
          <div className="section-label">Session</div>
          <h1>This tab is now read-only</h1>
          <p>This room is active in another tab.</p>
          <div className="session-panel__actions">
            <button
              className="button button--primary"
              type="button"
              onClick={handleRejoin}
              disabled={status !== "connected"}
            >
              Take control in this tab
            </button>
            <button className="button button--ghost" type="button" onClick={handleCloseTab}>
              Close this tab
            </button>
          </div>
        </section>
      )}

      <div className="room-layout">
        <div className="room-layout__main">
          <ParticipantsBoard state={state} />
        </div>

        <aside className="room-layout__aside">
          {state.revealed ? (
            <ResultsPanel state={state} />
          ) : (
            <VoteDeck
              state={state}
              selectedCard={selectedCard}
              onVote={handleVote}
              onClearVote={handleClearVote}
              disabled={actionsDisabled}
            />
          )}

          <ModeratorControls
            state={state}
            onReveal={handleReveal}
            onReset={handleReset}
            onNextRound={handleNextRound}
            onTransferModerator={handleTransferModerator}
            disabled={actionsDisabled}
          />
        </aside>
      </div>

      <Toast toast={toast} />
    </div>
  );
}
