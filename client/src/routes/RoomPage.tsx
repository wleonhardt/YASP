import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { useSocket } from "../hooks/useSocket";
import { useSession } from "../hooks/useSession";
import { useRoom } from "../hooks/useRoom";
import {
  setStoredDisplayName,
  getStoredDisplayName,
  getStoredRole,
  setStoredRole,
} from "../lib/storage";
import { getSelf } from "../lib/room";
import { ConnectionBadge } from "../components/ConnectionBadge";
import { ParticipantGrid } from "../components/ParticipantGrid";
import { VoteDeck } from "../components/VoteDeck";
import { RoomControls } from "../components/RoomControls";
import { RoomHeader } from "../components/RoomHeader";
import { SharePanel } from "../components/SharePanel";
import { StatsPanel } from "../components/StatsPanel";
import type { ParticipantRole } from "@yasp/shared";

export function RoomPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { socket, status } = useSocket();
  const { sessionId, storedName } = useSession();
  const room = useRoom(socket, sessionId);
  const [selectedCard, setSelectedCard] = useState<string | null>(null);
  const [needsManualJoin, setNeedsManualJoin] = useState(false);
  const [joinName, setJoinName] = useState(storedName || "");
  const [joinRole, setJoinRole] = useState<ParticipantRole>("voter");
  const autoJoinAttempted = useRef(false);
  const lastConnectedStatus = useRef(status);

  // Resolve the intended role for auto-join:
  // 1. Navigation state from LandingPage (create/join just happened)
  // 2. Stored role in localStorage
  // 3. Fallback to "voter"
  const navState = location.state as { role?: ParticipantRole } | null;

  function getIntendedRole(): ParticipantRole {
    if (navState?.role) return navState.role;
    return getStoredRole() ?? "voter";
  }

  // Auto-join: when socket connects, try to join automatically if we have a stored name
  useEffect(() => {
    if (status !== "connected" || !roomId) return;

    const wasDisconnected = lastConnectedStatus.current !== "connected";
    lastConnectedStatus.current = status;

    // If we already have room state (reconnect scenario), re-send join to rebind
    if (room.roomState && wasDisconnected) {
      const self = getSelf(room.roomState);
      const name = getStoredDisplayName() || self?.name || "Anonymous";
      const role = self?.role ?? getIntendedRole();
      room.joinRoom(roomId, name, role).then((result) => {
        if (
          !result.ok &&
          (result.error.code === "ROOM_NOT_FOUND" ||
            result.error.code === "ROOM_EXPIRED")
        ) {
          navigate("/");
        }
      });
      return;
    }

    // First connection: auto-join if we have a stored name and haven't tried yet
    if (!autoJoinAttempted.current) {
      autoJoinAttempted.current = true;
      const name = getStoredDisplayName();
      if (name) {
        const role = getIntendedRole();
        room.joinRoom(roomId, name, role).then((result) => {
          if (!result.ok) {
            if (
              result.error.code === "ROOM_NOT_FOUND" ||
              result.error.code === "ROOM_EXPIRED"
            ) {
              navigate("/");
            } else {
              setNeedsManualJoin(true);
            }
          }
        });
      } else {
        setNeedsManualJoin(true);
      }
    }
  }, [status]); // eslint-disable-line react-hooks/exhaustive-deps

  // Update lastConnectedStatus on disconnect too
  useEffect(() => {
    if (status !== "connected") {
      lastConnectedStatus.current = status;
    }
  }, [status]);

  // Track selected card from room state
  useEffect(() => {
    if (!room.roomState) return;
    const self = getSelf(room.roomState);
    if (!self) return;

    if (room.roomState.revealed && room.roomState.votes) {
      setSelectedCard(room.roomState.votes[self.id] ?? null);
    } else if (!room.roomState.revealed) {
      if (!self.hasVoted) {
        setSelectedCard(null);
      }
    }
  }, [room.roomState]);

  // All room actions (including leave) are disabled when session has been replaced.
  // The stale socket has no server-side authority — resolveCallerFromSocket rejects it.
  // The only recovery is to rejoin, which re-establishes this tab as the active socket.
  const actionsDisabled = room.sessionReplaced;

  const handleRejoin = async () => {
    if (!roomId || status !== "connected") return;
    const name = getStoredDisplayName() || storedName || "Anonymous";
    const role = getIntendedRole();
    await room.joinRoom(roomId, name, role);
  };

  const handleManualJoin = async (name: string, role: ParticipantRole) => {
    if (!roomId || !name.trim() || status !== "connected") return;
    setStoredDisplayName(name.trim());
    setStoredRole(role);
    const result = await room.joinRoom(roomId, name.trim(), role);
    if (result.ok) {
      setNeedsManualJoin(false);
    } else if (
      result.error.code === "ROOM_NOT_FOUND" ||
      result.error.code === "ROOM_EXPIRED"
    ) {
      navigate("/");
    }
  };

  const handleVote = async (value: string) => {
    if (!roomId || actionsDisabled) return;
    setSelectedCard(value);
    const result = await room.castVote(roomId, value);
    if (!result.ok) {
      setSelectedCard(null);
    }
  };

  const handleClearVote = async () => {
    if (!roomId || actionsDisabled) return;
    setSelectedCard(null);
    await room.clearVote(roomId);
  };

  const handleReveal = async () => {
    if (!roomId || actionsDisabled) return;
    await room.revealVotes(roomId);
  };

  const handleReset = async () => {
    if (!roomId || actionsDisabled) return;
    const result = await room.resetRound(roomId);
    if (result.ok) setSelectedCard(null);
  };

  const handleNextRound = async () => {
    if (!roomId || actionsDisabled) return;
    const result = await room.nextRound(roomId);
    if (result.ok) setSelectedCard(null);
  };

  const handleLeave = async () => {
    if (!roomId || actionsDisabled) return;
    await room.leaveRoom(roomId);
    navigate("/");
  };

  // Show manual join form when auto-join is impossible
  if (needsManualJoin && !room.roomState) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
        }}
      >
        <div style={{ position: "fixed", top: 16, right: 16 }}>
          <ConnectionBadge status={status} />
        </div>

        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>
          Join Room
        </h1>
        <p
          style={{
            color: "var(--color-text-muted)",
            marginBottom: 24,
            fontSize: 14,
          }}
        >
          Room: <strong>{roomId}</strong>
        </p>

        {room.sessionReplaced && (
          <div
            style={{
              padding: "10px 16px",
              borderRadius: "var(--radius)",
              background: "rgba(245, 158, 11, 0.15)",
              border: "1px solid var(--color-warning)",
              color: "var(--color-warning)",
              fontSize: 14,
              marginBottom: 16,
              maxWidth: 360,
              textAlign: "center",
            }}
          >
            Session replaced by another tab
          </div>
        )}

        <div
          style={{
            width: "100%",
            maxWidth: 360,
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <input
            type="text"
            value={joinName}
            onChange={(e) => setJoinName(e.target.value)}
            placeholder="Display name"
            maxLength={30}
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: "var(--radius)",
              border: "1px solid var(--color-border)",
              background: "var(--color-surface)",
              color: "var(--color-text)",
              outline: "none",
            }}
          />
          <div style={{ display: "flex", gap: 8 }}>
            {(["voter", "spectator"] as ParticipantRole[]).map((r) => (
              <button
                key={r}
                onClick={() => setJoinRole(r)}
                style={{
                  flex: 1,
                  padding: "8px 16px",
                  borderRadius: "var(--radius)",
                  border:
                    joinRole === r
                      ? "2px solid var(--color-primary)"
                      : "1px solid var(--color-border)",
                  background:
                    joinRole === r
                      ? "var(--color-card-selected)"
                      : "var(--color-surface)",
                  color: "var(--color-text)",
                  fontWeight: joinRole === r ? 600 : 400,
                  textTransform: "capitalize",
                }}
              >
                {r}
              </button>
            ))}
          </div>
          <button
            onClick={() => handleManualJoin(joinName, joinRole)}
            disabled={!joinName.trim() || status !== "connected"}
            style={{
              padding: "12px 24px",
              borderRadius: "var(--radius)",
              background:
                joinName.trim() && status === "connected"
                  ? "var(--color-primary)"
                  : "var(--color-surface)",
              color:
                joinName.trim() && status === "connected"
                  ? "#fff"
                  : "var(--color-text-muted)",
              fontWeight: 600,
              fontSize: 16,
            }}
          >
            Join Room
          </button>

          {room.error && room.error.code !== "SESSION_REPLACED" && (
            <div
              style={{
                padding: "10px 16px",
                borderRadius: "var(--radius)",
                background: "rgba(239, 68, 68, 0.15)",
                border: "1px solid var(--color-danger)",
                color: "var(--color-danger)",
                fontSize: 14,
              }}
            >
              {room.error.message}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Loading state while auto-join is in flight
  if (!room.roomState) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--color-text-muted)",
        }}
      >
        <div style={{ position: "fixed", top: 16, right: 16 }}>
          <ConnectionBadge status={status} />
        </div>
        Joining room...
      </div>
    );
  }

  const state = room.roomState;

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        padding: 24,
        maxWidth: 900,
        margin: "0 auto",
      }}
    >
      {/* Top bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 16,
        }}
      >
        <SharePanel roomId={state.id} />
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <ConnectionBadge status={status} />
          <button
            onClick={handleLeave}
            disabled={actionsDisabled}
            style={{
              padding: "6px 14px",
              borderRadius: "var(--radius)",
              border: "1px solid var(--color-border)",
              color: "var(--color-text-muted)",
              fontSize: 13,
              opacity: actionsDisabled ? 0.4 : 1,
              cursor: actionsDisabled ? "not-allowed" : "pointer",
            }}
          >
            Leave
          </button>
        </div>
      </div>

      {/* Error banner */}
      {room.error && room.error.code !== "SESSION_REPLACED" && (
        <div
          style={{
            padding: "8px 16px",
            borderRadius: "var(--radius)",
            background: "rgba(239, 68, 68, 0.15)",
            border: "1px solid var(--color-danger)",
            color: "var(--color-danger)",
            fontSize: 14,
            marginBottom: 12,
          }}
        >
          {room.error.message}
        </div>
      )}

      {room.sessionReplaced && (
        <div
          style={{
            padding: "12px 16px",
            borderRadius: "var(--radius)",
            background: "rgba(245, 158, 11, 0.15)",
            border: "1px solid var(--color-warning)",
            color: "var(--color-warning)",
            fontSize: 14,
            marginBottom: 12,
            textAlign: "center",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span>
            This tab&apos;s session was replaced by another tab. All actions are
            disabled until you rejoin.
          </span>
          <button
            onClick={handleRejoin}
            disabled={status !== "connected"}
            style={{
              padding: "6px 18px",
              borderRadius: "var(--radius)",
              background: "var(--color-warning)",
              color: "#000",
              fontWeight: 600,
              fontSize: 13,
              cursor: status === "connected" ? "pointer" : "not-allowed",
              opacity: status === "connected" ? 1 : 0.5,
            }}
          >
            Rejoin
          </button>
        </div>
      )}

      <RoomHeader state={state} />
      <ParticipantGrid state={state} />
      <RoomControls
        state={state}
        onReveal={handleReveal}
        onReset={handleReset}
        onNextRound={handleNextRound}
        disabled={actionsDisabled}
      />
      <VoteDeck
        state={state}
        selectedCard={selectedCard}
        onVote={handleVote}
        onClearVote={handleClearVote}
        disabled={actionsDisabled}
      />

      {state.revealed && state.stats && <StatsPanel stats={state.stats} />}
    </div>
  );
}
