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
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { getNextRovingValue } from "../lib/rovingFocus";
import { useRoom } from "../hooks/useRoom";
import { COFFEE_CARD_TOKEN, QUESTION_MARK_TOKEN } from "../lib/deckTokens";
import { useSession } from "../hooks/useSession";
import { useSocket } from "../hooks/useSocket";
import { setStoredDisplayName, setStoredRole } from "../lib/storage";

const ROLE_OPTIONS = [
  { value: "voter", label: "Voter", helper: "Choose a card" },
  { value: "spectator", label: "Spectator", helper: "Watch only" },
] as const satisfies ReadonlyArray<{ value: ParticipantRole; label: string; helper: string }>;

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

  useDocumentTitle("Scrum Poker");

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
  const roleOptionRefs = useRef<Record<ParticipantRole, HTMLButtonElement | null>>({
    voter: null,
    spectator: null,
  });

  const handleRoleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, currentRole: ParticipantRole) => {
    const nextRole = getNextRovingValue(
      ROLE_OPTIONS.map((option) => option.value),
      currentRole,
      event.key
    );

    if (!nextRole) {
      return;
    }

    event.preventDefault();
    setRole(nextRole);
    roleOptionRefs.current[nextRole]?.focus();
  };

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
      <main className="landing-page">
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
            <span className="field__label" id="role-label">
              Role
            </span>
            <div className="segmented" role="radiogroup" aria-labelledby="role-label">
              {ROLE_OPTIONS.map(({ value, label, helper }) => (
                <button
                  key={value}
                  ref={(element) => {
                    roleOptionRefs.current[value] = element;
                  }}
                  type="button"
                  role="radio"
                  aria-checked={role === value}
                  tabIndex={role === value ? 0 : -1}
                  className={["segmented__option", role === value ? "segmented__option--active" : ""]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={() => setRole(value)}
                  onKeyDown={(event) => handleRoleKeyDown(event, value)}
                >
                  <span>{label}</span>
                  <small>{helper}</small>
                </button>
              ))}
            </div>
          </div>
        </section>

        <div className="landing-page__actions">
          <form className="app-panel action-card" onSubmit={handleCreate} aria-label="Create room">
            <div className="section-header">
              <div>
                <h2>Create room</h2>
              </div>
            </div>

            <div className="field">
              <div className="landing-page__deck-head">
                <label className="field__label" htmlFor="deck-select">
                  Deck
                </label>
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
                id="deck-select"
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

          <form
            className="app-panel action-card action-card--secondary"
            onSubmit={handleJoin}
            aria-label="Join room"
          >
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
        <a
          href="https://github.com/wleonhardt/YASP"
          target="_blank"
          rel="noopener noreferrer"
          className="landing-page__github-link"
          aria-label="GitHub"
        >
          <svg
            viewBox="0 0 16 16"
            width="1em"
            height="1em"
            fill="currentColor"
            aria-hidden="true"
            className="landing-page__github-icon"
          >
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
          </svg>
        </a>
      </main>

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
