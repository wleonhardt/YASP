import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSocket } from "../hooks/useSocket";
import { useSession } from "../hooks/useSession";
import { useRoom } from "../hooks/useRoom";
import { setStoredDisplayName, setStoredRole } from "../lib/storage";
import { ConnectionBadge } from "../components/ConnectionBadge";
import type { ParticipantRole, DeckType } from "@yasp/shared";
import { DEFAULT_DECKS } from "@yasp/shared";

export function LandingPage() {
  const navigate = useNavigate();
  const { socket, status } = useSocket();
  const { storedName } = useSession();
  const { createRoom, joinRoom, error } = useRoom(socket, useSession().sessionId);

  const [name, setName] = useState(storedName || "");
  const [role, setRole] = useState<ParticipantRole>("voter");
  const [deckType, setDeckType] = useState<DeckType>("fibonacci");
  const [joinRoomId, setJoinRoomId] = useState("");
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    if (!name.trim() || status !== "connected") return;
    setLoading(true);
    setStoredDisplayName(name.trim());
    setStoredRole(role);
    const result = await createRoom(name.trim(), role, { type: deckType } as any);
    setLoading(false);
    if (result.ok) {
      navigate(`/r/${result.data.roomId}`, { state: { role } });
    }
  };

  const handleJoin = async () => {
    if (!name.trim() || !joinRoomId.trim() || status !== "connected") return;
    setLoading(true);
    setStoredDisplayName(name.trim());
    setStoredRole(role);
    const result = await joinRoom(joinRoomId.trim().toUpperCase(), name.trim(), role);
    setLoading(false);
    if (result.ok) {
      navigate(`/r/${joinRoomId.trim().toUpperCase()}`, { state: { role } });
    }
  };

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

      <h1 style={{ fontSize: 36, fontWeight: 700, marginBottom: 8 }}>YASP</h1>
      <p style={{ color: "var(--color-text-muted)", marginBottom: 32 }}>
        Yet Another Scrum Poker
      </p>

      <div
        style={{
          width: "100%",
          maxWidth: 400,
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        {/* Name */}
        <div>
          <label
            style={{ display: "block", fontSize: 13, color: "var(--color-text-muted)", marginBottom: 4 }}
          >
            Display Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Enter your name"
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
        </div>

        {/* Role */}
        <div>
          <label
            style={{ display: "block", fontSize: 13, color: "var(--color-text-muted)", marginBottom: 4 }}
          >
            Role
          </label>
          <div style={{ display: "flex", gap: 8 }}>
            {(["voter", "spectator"] as ParticipantRole[]).map((r) => (
              <button
                key={r}
                onClick={() => setRole(r)}
                style={{
                  flex: 1,
                  padding: "8px 16px",
                  borderRadius: "var(--radius)",
                  border:
                    role === r
                      ? "2px solid var(--color-primary)"
                      : "1px solid var(--color-border)",
                  background:
                    role === r ? "var(--color-card-selected)" : "var(--color-surface)",
                  color: "var(--color-text)",
                  fontWeight: role === r ? 600 : 400,
                  textTransform: "capitalize",
                }}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        {/* Deck selector */}
        <div>
          <label
            style={{ display: "block", fontSize: 13, color: "var(--color-text-muted)", marginBottom: 4 }}
          >
            Deck
          </label>
          <select
            value={deckType}
            onChange={(e) => setDeckType(e.target.value as DeckType)}
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: "var(--radius)",
              border: "1px solid var(--color-border)",
              background: "var(--color-surface)",
              color: "var(--color-text)",
              outline: "none",
            }}
          >
            {Object.values(DEFAULT_DECKS).map((d) => (
              <option key={d.type} value={d.type}>
                {d.label}
              </option>
            ))}
          </select>
        </div>

        {/* Create button */}
        <button
          onClick={handleCreate}
          disabled={!name.trim() || status !== "connected" || loading}
          style={{
            padding: "12px 24px",
            borderRadius: "var(--radius)",
            background:
              name.trim() && status === "connected"
                ? "var(--color-primary)"
                : "var(--color-surface)",
            color:
              name.trim() && status === "connected"
                ? "#fff"
                : "var(--color-text-muted)",
            fontWeight: 600,
            fontSize: 16,
            cursor:
              name.trim() && status === "connected" ? "pointer" : "not-allowed",
          }}
        >
          {loading ? "Creating..." : "Create Room"}
        </button>

        {/* Divider */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            color: "var(--color-text-muted)",
          }}
        >
          <div
            style={{ flex: 1, height: 1, background: "var(--color-border)" }}
          />
          <span style={{ fontSize: 13 }}>or join existing</span>
          <div
            style={{ flex: 1, height: 1, background: "var(--color-border)" }}
          />
        </div>

        {/* Join */}
        <div style={{ display: "flex", gap: 8 }}>
          <input
            type="text"
            value={joinRoomId}
            onChange={(e) => setJoinRoomId(e.target.value.toUpperCase())}
            placeholder="Room code"
            maxLength={10}
            style={{
              flex: 1,
              padding: "10px 12px",
              borderRadius: "var(--radius)",
              border: "1px solid var(--color-border)",
              background: "var(--color-surface)",
              color: "var(--color-text)",
              outline: "none",
              textTransform: "uppercase",
              letterSpacing: 2,
              fontWeight: 600,
            }}
          />
          <button
            onClick={handleJoin}
            disabled={
              !name.trim() ||
              !joinRoomId.trim() ||
              status !== "connected" ||
              loading
            }
            style={{
              padding: "10px 20px",
              borderRadius: "var(--radius)",
              background: "var(--color-primary)",
              color: "#fff",
              fontWeight: 600,
              opacity:
                name.trim() && joinRoomId.trim() && status === "connected"
                  ? 1
                  : 0.5,
              cursor:
                name.trim() && joinRoomId.trim() && status === "connected"
                  ? "pointer"
                  : "not-allowed",
            }}
          >
            Join
          </button>
        </div>

        {/* Error */}
        {error && (
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
            {error.message}
          </div>
        )}
      </div>
    </div>
  );
}
