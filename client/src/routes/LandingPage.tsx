import type { ReactNode } from "react";
import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { DeckInput, DeckType, ParticipantRole } from "@yasp/shared";
import { DEFAULT_DECKS } from "@yasp/shared";
import { Banner } from "../components/Banner";
import { ConnectionBadge } from "../components/ConnectionBadge";
import { DeckToken } from "../components/DeckToken";
import { DeckCustomizeModal } from "../components/DeckCustomizeModal";
import { ThemeToggle } from "../components/ThemeToggle";
import { useRoom } from "../hooks/useRoom";
import { COFFEE_CARD_TOKEN, QUESTION_MARK_TOKEN } from "../lib/deckTokens";
import { useSession } from "../hooks/useSession";
import { useSocket } from "../hooks/useSocket";
import { setStoredDisplayName, setStoredRole } from "../lib/storage";

function formatDeckOverrideSummary(deckOverride: DeckInput | null): ReactNode {
  if (!deckOverride || deckOverride.type !== "custom") {
    return null;
  }

  const hasQuestionMark = deckOverride.cards.includes(QUESTION_MARK_TOKEN);
  const hasCoffee = deckOverride.cards.includes(COFFEE_CARD_TOKEN);
  return (
    <>
      <span>Using custom deck: {deckOverride.label}</span>
      <span aria-hidden="true"> · </span>
      <span>? {hasQuestionMark ? "on" : "off"}</span>
      <span aria-hidden="true"> · </span>
      <DeckToken token={COFFEE_CARD_TOKEN} coffeeText="Coffee" />
      <span> {hasCoffee ? "on" : "off"}</span>
    </>
  );
}

export function LandingPage() {
  const navigate = useNavigate();
  const { socket, status } = useSocket();
  const { sessionId, storedName } = useSession();
  const { createRoom, joinRoom, error } = useRoom(socket, sessionId);

  const [name, setName] = useState(storedName || "");
  const [role, setRole] = useState<ParticipantRole>("voter");
  const [deckType, setDeckType] = useState<Exclude<DeckType, "custom">>("fibonacci");
  const [deckOverride, setDeckOverride] = useState<DeckInput | null>(null);
  const [showDeckModal, setShowDeckModal] = useState(false);
  const [deckModalBaseType, setDeckModalBaseType] = useState<Exclude<DeckType, "custom">>(deckType);
  const [joinRoomId, setJoinRoomId] = useState("");
  const [pendingAction, setPendingAction] = useState<"create" | "join" | null>(null);

  const connected = status === "connected";
  const canSubmitIdentity = name.trim().length > 0 && connected;
  const deckOptions = Object.values(DEFAULT_DECKS);
  const deckOverrideSummary = formatDeckOverrideSummary(deckOverride);

  const headlines = [
    "Estimate together in seconds",
    "One link. One room. Zero friction.",
    "No accounts. No history. Just poker.",
    "Point, vote, ship.",
  ];
  const headlineIndex = useRef(Math.floor(Math.random() * headlines.length));
  const headline = headlines[headlineIndex.current];

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmitIdentity) {
      return;
    }

    setPendingAction("create");
    setStoredDisplayName(name.trim());
    setStoredRole(role);

    const deckInputToSend = deckOverride ?? { type: deckType };
    const result = await createRoom(name.trim(), role, deckInputToSend);
    setPendingAction(null);

    if (result.ok) {
      navigate(`/r/${result.data.roomId}`, { state: { role } });
    }
  }

  async function handleJoin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmitIdentity || !joinRoomId.trim()) {
      return;
    }

    const normalizedRoomId = joinRoomId.trim().toUpperCase();

    setPendingAction("join");
    setStoredDisplayName(name.trim());
    setStoredRole(role);

    const result = await joinRoom(normalizedRoomId, name.trim(), role);
    setPendingAction(null);

    if (result.ok) {
      navigate(`/r/${normalizedRoomId}`, { state: { role } });
    }
  }

  return (
    <div className="page-shell page-shell--centered">
      <div className="landing-page">
        <div className="landing-page__status">
          <ConnectionBadge status={status} />
          <ThemeToggle />
        </div>

        <header className="landing-page__hero">
          <div className="landing-page__eyebrow">Yet Another Scrum Poker</div>
          <h1>{headline}</h1>
          <p>Create a room and estimate together. No sign-up required.</p>
        </header>

        {!connected && (
          <Banner tone={status === "connecting" ? "info" : "warning"}>
            {status === "connecting"
              ? "Connecting to the room service…"
              : "Disconnected. Trying to reconnect before you can create or join a room."}
          </Banner>
        )}

        {error && (
          <Banner tone="error" title="Couldn’t continue">
            {error.message}
          </Banner>
        )}

        <section className="app-panel identity-panel">
          <div className="section-header">
            <div>
              <h2>Who’s joining?</h2>
            </div>
          </div>

          <label className="field">
            <span className="field__label">Display name</span>
            <input
              className="input"
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Enter your display name"
              maxLength={30}
            />
          </label>

          <div className="field">
            <span className="field__label">Role</span>
            <div className="segmented">
              {(
                [
                  ["voter", "Choose a card"],
                  ["spectator", "Watch only"],
                ] as const
              ).map(([value, helper]) => (
                <button
                  key={value}
                  type="button"
                  className={["segmented__option", role === value ? "segmented__option--active" : ""]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={() => setRole(value)}
                >
                  <span>{value === "voter" ? "Voter" : "Spectator"}</span>
                  <small>{helper}</small>
                </button>
              ))}
            </div>
          </div>
        </section>

        <div className="landing-page__actions">
          <form className="app-panel action-card" onSubmit={handleCreate}>
            <div className="section-header">
              <div>
                <h2>Create room</h2>
              </div>
            </div>

            <div className="field">
              <div className="landing-page__deck-head">
                <span className="field__label">Deck</span>
                <button
                  className="landing-page__customize-trigger"
                  type="button"
                  onClick={() => {
                    setDeckModalBaseType(deckType);
                    setShowDeckModal(true);
                  }}
                >
                  Customize
                </button>
              </div>
              <select
                className="input"
                value={deckType}
                onChange={(event) => {
                  setDeckType(event.target.value as Exclude<DeckType, "custom">);
                  setDeckOverride(null);
                }}
              >
                {deckOptions.map((deck) => (
                  <option key={deck.type} value={deck.type}>
                    {deck.label}
                  </option>
                ))}
              </select>
              {deckOverrideSummary && <p className="landing-page__deck-note">{deckOverrideSummary}</p>}
            </div>

            <button
              className="button button--primary button--full"
              type="submit"
              disabled={!canSubmitIdentity || pendingAction !== null}
            >
              {pendingAction === "create" ? "Creating…" : "Create room"}
            </button>
          </form>

          <form className="app-panel action-card action-card--secondary" onSubmit={handleJoin}>
            <div className="section-header">
              <div>
                <h2>Join room</h2>
              </div>
            </div>

            <label className="field">
              <span className="field__label">Room code</span>
              <input
                className="input input--code"
                type="text"
                value={joinRoomId}
                onChange={(event) => setJoinRoomId(event.target.value.toUpperCase())}
                placeholder="Enter room code"
                maxLength={10}
              />
            </label>

            <button
              className="button button--secondary button--full"
              type="submit"
              disabled={!canSubmitIdentity || !joinRoomId.trim() || pendingAction !== null}
            >
              {pendingAction === "join" ? "Joining…" : "Join room"}
            </button>
          </form>
        </div>

        <p className="landing-page__note">Rooms expire after inactivity. No data is stored.</p>
      </div>

      <DeckCustomizeModal
        open={showDeckModal}
        baseDeckType={deckModalBaseType}
        onClose={() => setShowDeckModal(false)}
        onApply={(customDeck) => {
          setDeckOverride(customDeck);
          setShowDeckModal(false);
        }}
      />
    </div>
  );
}
