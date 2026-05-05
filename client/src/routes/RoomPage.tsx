import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import type { ParticipantRole, RoomSettings } from "@yasp/shared";
import { Banner } from "../components/Banner";
import { ConnectionBadge } from "../components/ConnectionBadge";
import { ConnectionStatusNotice } from "../components/ConnectionStatusNotice";
import { InviteHero } from "../components/InviteHero";
import { LanguageSwitcher } from "../components/LanguageSwitcher";
import { ModeratorControls } from "../components/ModeratorControls";
import { ParticipantsBoard } from "../components/ParticipantsBoard";
import { ResultsPanel } from "../components/ResultsPanel";
import { RoundActionBar } from "../components/RoundActionBar";
import { RoundReportModal } from "../components/RoundReportModal";
import { SessionReportModal } from "../components/SessionReportModal";
import { StoryAgenda } from "../components/StoryAgenda";
import { ThemeToggle } from "../components/ThemeToggle";
import { TimerStrip } from "../components/TimerStrip";
import { Toast, type ToastState } from "../components/Toast";
import { TopBar } from "../components/TopBar";
import { VoteDeck } from "../components/VoteDeck";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { useServerClockOffset } from "../hooks/useServerClockOffset";
import { getNextRovingValue } from "../lib/rovingFocus";
import { useRoom } from "../hooks/useRoom";
import { useSession } from "../hooks/useSession";
import { useSocket } from "../hooks/useSocket";
import {
  buildRoundReport,
  formatRoundReportTime,
  sessionToPlainText,
  toPlainTextSummary,
  writeTextToClipboard,
} from "../lib/roundReport";
import {
  getConnectedVoterCounts,
  getSelf,
  isMeModerator,
  isTimerStripRelevant,
  shouldShowInviteHero,
  shouldShowStoryAgenda,
} from "../lib/room";
import { getRoomShortcutAction } from "../lib/roomShortcuts";
import { getStoredDisplayName, getStoredRole, setStoredDisplayName, setStoredRole } from "../lib/storage";

type RoomUnavailableReason = "ROOM_NOT_FOUND" | "ROOM_EXPIRED";
const JOIN_ROLE_OPTIONS = ["voter", "spectator"] as const satisfies readonly ParticipantRole[];

function formatOptionalSummaryNumber(value: number | null, fallback: string): string {
  if (value === null) {
    return fallback;
  }

  return value.toFixed(1).replace(/\.0$/, "");
}

export function RoomPage() {
  const { t, i18n } = useTranslation();
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const connection = useSocket();
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
    resetTimer: resetSharedTimer,
    honkTimer,
    updateSettings,
  } = useRoom(connection.socket, sessionId);

  const [selectedCard, setSelectedCard] = useState<string | null>(null);
  const [needsManualJoin, setNeedsManualJoin] = useState(false);
  const [joinName, setJoinName] = useState(storedName || "");
  const [joinRole, setJoinRole] = useState<ParticipantRole>("voter");
  const [toast, setToast] = useState<ToastState | null>(null);
  const [roomUnavailable, setRoomUnavailable] = useState<RoomUnavailableReason | null>(null);
  const [roundReportOpen, setRoundReportOpen] = useState(false);
  const [revealedAt, setRevealedAt] = useState<number | null>(null);
  const roundReportButtonRef = useRef<HTMLButtonElement | null>(null);
  const [sessionReportOpen, setSessionReportOpen] = useState(false);
  const sessionReportButtonRef = useRef<HTMLButtonElement | null>(null);
  const [trackStories, setTrackStories] = useState(false);
  const [timerStripActivated, setTimerStripActivated] = useState(false);

  const roomTitle = roomUnavailable
    ? t("documentTitle.roomUnavailable")
    : roomState
      ? t("documentTitle.roomRound", {
          roomId,
          roundNumber: roomState.roundNumber,
          revealedSuffix: roomState.revealed ? t("documentTitle.revealedSuffix") : "",
        })
      : needsManualJoin
        ? t("documentTitle.join", { roomId })
        : t("documentTitle.joining", { roomId });
  useDocumentTitle(roomTitle);
  const serverClockOffsetMs = useServerClockOffset(connection.socket, Boolean(roomState));

  const autoJoinAttempted = useRef(false);
  const lastConnectedStatus = useRef(connection.status);
  const lastErrorKey = useRef<string | null>(null);
  const toastTimeout = useRef<number | null>(null);
  const announcementTimeout = useRef<number | null>(null);
  const [liveAnnouncement, setLiveAnnouncement] = useState("");
  const prevRoundRef = useRef<number | null>(null);
  const prevRevealedRef = useRef<boolean | null>(null);
  const prevVoteProgressRef = useRef<string | null>(null);
  const prevModeratorRef = useRef<string | null>(null);
  const prevTimerCompletedRef = useRef<number | null>(null);
  const joinRoleRefs = useRef<Record<ParticipantRole, HTMLButtonElement | null>>({
    voter: null,
    spectator: null,
  });

  const announce = useCallback((message: string) => {
    if (announcementTimeout.current !== null) {
      window.clearTimeout(announcementTimeout.current);
    }

    setLiveAnnouncement("");
    announcementTimeout.current = window.setTimeout(() => {
      setLiveAnnouncement(message);
      announcementTimeout.current = null;
    }, 32);
  }, []);

  useEffect(() => {
    if (!roomState) {
      prevRoundRef.current = null;
      prevRevealedRef.current = null;
      prevVoteProgressRef.current = null;
      prevModeratorRef.current = null;
      prevTimerCompletedRef.current = null;
      setTrackStories(false);
      setTimerStripActivated(false);
      return;
    }

    const { voted, total } = getConnectedVoterCounts(roomState);
    const voteProgress = `${voted}/${total}`;
    const moderator = roomState.participants.find((participant) => participant.isModerator) ?? null;
    let nextAnnouncement: string | null = null;

    if (prevRoundRef.current !== null && roomState.roundNumber !== prevRoundRef.current) {
      nextAnnouncement = t("room.announce.roundStarted", { count: roomState.roundNumber });
    } else if (prevRevealedRef.current !== null && roomState.revealed !== prevRevealedRef.current) {
      nextAnnouncement = roomState.revealed
        ? t("room.announce.votesRevealed")
        : t("room.announce.votesReset");
    } else if (prevModeratorRef.current !== null && moderator && moderator.id !== prevModeratorRef.current) {
      nextAnnouncement = t("room.announce.moderatorChanged", { name: moderator.name });
    } else if (
      prevTimerCompletedRef.current !== null &&
      roomState.timer.completedAt !== null &&
      roomState.timer.completedAt !== prevTimerCompletedRef.current
    ) {
      nextAnnouncement = t("room.timerState.complete");
    } else if (
      !roomState.revealed &&
      prevRevealedRef.current === roomState.revealed &&
      prevRoundRef.current === roomState.roundNumber &&
      prevVoteProgressRef.current !== null &&
      voteProgress !== prevVoteProgressRef.current
    ) {
      nextAnnouncement =
        total > 0 && voted === total
          ? t("room.announce.allVotesIn")
          : t("room.announce.voteProgress", { voted, total });
    }

    if (nextAnnouncement) {
      announce(nextAnnouncement);
    }

    prevRoundRef.current = roomState.roundNumber;
    prevRevealedRef.current = roomState.revealed;
    prevVoteProgressRef.current = voteProgress;
    prevModeratorRef.current = moderator?.id ?? null;
    prevTimerCompletedRef.current = roomState.timer.completedAt;
  }, [announce, roomState, t]);

  useEffect(() => {
    if (!roomState) {
      return;
    }

    if (isTimerStripRelevant(roomState)) {
      setTimerStripActivated(true);
    }
  }, [roomState]);

  // Capture a client-side `revealedAt` when the room transitions into
  // the revealed phase. The server does not expose this on
  // PublicRoomState — the modal is current-round-only and ephemeral, so a
  // local stamp is fine.
  useEffect(() => {
    if (!roomState) {
      setRevealedAt(null);
      setRoundReportOpen(false);
      return;
    }

    if (roomState.revealed && revealedAt === null) {
      setRevealedAt(Date.now());
    } else if (!roomState.revealed && revealedAt !== null) {
      setRevealedAt(null);
      setRoundReportOpen(false);
    }
  }, [revealedAt, roomState]);

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
    toastTimeout.current = window.setTimeout(() => setToast(null), 5000);
  }, []);

  const handleCopyRoundSummary = useCallback(async () => {
    if (!roomState || revealedAt === null || !isMeModerator(roomState)) {
      return;
    }

    const report = buildRoundReport(roomState, revealedAt);
    if (!report) {
      return;
    }

    const notAvailable = t("room.notAvailable");
    const revealedAtLabel = formatRoundReportTime(report.revealedAt, i18n.language);
    const consensusValue = report.stats.consensus
      ? t("room.consensusReached")
      : report.stats.mostCommon === null
        ? t("room.tie")
        : t("room.noConsensus");

    const summaryText = toPlainTextSummary({
      heading: t("room.roundReport.summaryTitle"),
      meta: t("room.roundReport.meta", {
        round: report.roundNumber,
        time: revealedAtLabel,
      }),
      story: report.storyLabel ? t("room.roundReport.story", { story: report.storyLabel }) : undefined,
      deck: t("room.roundReport.deck", { deck: report.deckLabel }),
      stats: [
        {
          label: t("room.average"),
          value: formatOptionalSummaryNumber(report.stats.numericAverage, notAvailable),
        },
        {
          label: t("room.median"),
          value: formatOptionalSummaryNumber(report.stats.median, notAvailable),
        },
        {
          label: t("room.mostCommon"),
          value: report.stats.mostCommon ?? t("room.tie"),
        },
        {
          label: t("room.consensus"),
          value: consensusValue,
        },
      ],
      votesHeading: t("room.roundReport.votes"),
      votes: report.voters.map((voter) => `${voter.name}: ${voter.vote ?? t("room.participant.notVoted")}`),
    });

    try {
      await writeTextToClipboard(summaryText);
      showToast("success", t("room.copied"));
    } catch {
      showToast("error", t("room.copyFailed"));
    }
  }, [i18n.language, revealedAt, roomState, showToast, t]);

  const handleCopySessionSummary = useCallback(async () => {
    if (!roomState || !isMeModerator(roomState)) {
      return;
    }

    const { sessionRounds } = roomState;
    if (sessionRounds.length === 0) {
      return;
    }

    const summaryText = sessionToPlainText(sessionRounds, roomState.id, i18n.language, t);

    try {
      await writeTextToClipboard(summaryText);
      showToast("success", t("room.copied"));
    } catch {
      showToast("error", t("room.copyFailed"));
    }
  }, [i18n.language, roomState, showToast, t]);

  useEffect(() => {
    return () => {
      if (toastTimeout.current !== null) {
        window.clearTimeout(toastTimeout.current);
      }
      if (announcementTimeout.current !== null) {
        window.clearTimeout(announcementTimeout.current);
      }
    };
  }, []);

  const getIntendedRole = useCallback((): ParticipantRole => {
    if (navState?.role) {
      return navState.role;
    }

    return getStoredRole() ?? "voter";
  }, [navState]);

  const attemptJoinRoom = useCallback(
    async (name: string, role: ParticipantRole, showManualJoinOnFailure = false) => {
      if (!roomId) {
        return null;
      }

      const result = await joinRoom(roomId, name, role);
      if (!result.ok) {
        checkRoomUnavailable(result);
        if (showManualJoinOnFailure && !result.error.code.startsWith("ROOM_")) {
          setNeedsManualJoin(true);
        }
      }

      return result;
    },
    [checkRoomUnavailable, joinRoom, roomId]
  );

  useEffect(() => {
    if (connection.status !== "connected" || !roomId) {
      return;
    }

    const wasDisconnected = lastConnectedStatus.current !== "connected";
    lastConnectedStatus.current = connection.status;

    if (roomState && wasDisconnected) {
      const self = getSelf(roomState);
      const name = getStoredDisplayName() || self?.name || t("common.anonymous");
      const role = self?.role ?? getIntendedRole();
      void attemptJoinRoom(name, role);

      return;
    }

    if (!autoJoinAttempted.current) {
      autoJoinAttempted.current = true;
      const name = getStoredDisplayName();

      if (name) {
        const role = getIntendedRole();
        void attemptJoinRoom(name, role, true);
      } else {
        setNeedsManualJoin(true);
      }
    }
  }, [attemptJoinRoom, connection.status, getIntendedRole, roomId, roomState, t]);

  useEffect(() => {
    if (connection.status !== "connected") {
      lastConnectedStatus.current = connection.status;
    }
  }, [connection.status]);

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
    } else if (!roomState.revealed) {
      setSelectedCard(roomState.me.ownVote);
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
    if (!roomId || connection.status !== "connected") {
      return;
    }

    const name = getStoredDisplayName() || storedName || t("common.anonymous");
    const role = getIntendedRole();
    await joinRoom(roomId, name, role);
  }, [connection.status, getIntendedRole, joinRoom, roomId, storedName, t]);

  const handleCloseTab = () => {
    window.close();
    window.setTimeout(() => navigate("/"), 120);
  };

  const handleJoinRoleKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    currentRole: ParticipantRole
  ) => {
    const nextRole = getNextRovingValue(JOIN_ROLE_OPTIONS, currentRole, event.key);
    if (!nextRole) {
      return;
    }

    event.preventDefault();
    setJoinRole(nextRole);
    joinRoleRefs.current[nextRole]?.focus();
  };

  const handleManualJoin = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      if (!roomId || !joinName.trim() || connection.status !== "connected") {
        return;
      }

      setStoredDisplayName(joinName.trim());
      setStoredRole(joinRole);
      const result = await attemptJoinRoom(joinName.trim(), joinRole);

      if (result?.ok) {
        setNeedsManualJoin(false);
      }
    },
    [attemptJoinRoom, connection.status, joinName, joinRole, roomId]
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

  const handleReopenVoting = useCallback(async () => {
    if (!roomId || actionsDisabled) {
      return;
    }

    const result = await reopenVoting(roomId);
    if (result.ok) {
      setSelectedCard(roomState?.me.ownVote ?? null);
    }
  }, [actionsDisabled, reopenVoting, roomId, roomState?.me.ownVote]);

  const handleNextRound = useCallback(async () => {
    if (!roomId || actionsDisabled) {
      return;
    }

    const result = await nextRound(roomId);
    if (result.ok) {
      setSelectedCard(null);
    }
  }, [actionsDisabled, nextRound, roomId]);

  const handleUpdateStoryLabel = useCallback(
    async (label: string) => {
      if (!roomId || actionsDisabled) {
        return false;
      }

      const result = await updateStoryLabel(roomId, label);
      return result.ok;
    },
    [actionsDisabled, roomId, updateStoryLabel]
  );

  const handleAddStoryAgendaItems = useCallback(
    async (labels: string[]) => {
      if (!roomId || actionsDisabled) {
        return false;
      }

      const result = await addStoryAgendaItems(roomId, labels);
      return result.ok;
    },
    [actionsDisabled, addStoryAgendaItems, roomId]
  );

  const handleRemoveStoryAgendaItem = useCallback(
    async (itemId: string) => {
      if (!roomId || actionsDisabled) {
        return false;
      }

      const result = await removeStoryAgendaItem(roomId, itemId);
      return result.ok;
    },
    [actionsDisabled, removeStoryAgendaItem, roomId]
  );

  const handleMoveStoryAgendaItem = useCallback(
    async (itemId: string, direction: "up" | "down") => {
      if (!roomId || actionsDisabled) {
        return false;
      }

      const result = await moveStoryAgendaItem(roomId, itemId, direction);
      return result.ok;
    },
    [actionsDisabled, moveStoryAgendaItem, roomId]
  );

  const handleStartNextStory = useCallback(async () => {
    if (!roomId || actionsDisabled) {
      return false;
    }

    const result = await startNextStory(roomId);
    if (result.ok) {
      setSelectedCard(null);
    }
    return result.ok;
  }, [actionsDisabled, roomId, startNextStory]);

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

  const handleSetTimerDuration = useCallback(
    async (durationSeconds: number) => {
      if (!roomId || actionsDisabled) {
        return;
      }

      await setTimerDuration(roomId, durationSeconds);
    },
    [actionsDisabled, roomId, setTimerDuration]
  );

  const handleStartTimer = useCallback(async () => {
    if (!roomId || actionsDisabled) {
      return false;
    }

    const result = await startTimer(roomId);
    return result.ok;
  }, [actionsDisabled, roomId, startTimer]);

  const handlePauseTimer = useCallback(async () => {
    if (!roomId || actionsDisabled) {
      return;
    }

    await pauseTimer(roomId);
  }, [actionsDisabled, pauseTimer, roomId]);

  const handleResetTimer = useCallback(async () => {
    if (!roomId || actionsDisabled) {
      return;
    }

    await resetSharedTimer(roomId);
  }, [actionsDisabled, resetSharedTimer, roomId]);

  const handleHonkTimer = useCallback(async () => {
    if (!roomId || actionsDisabled) {
      return false;
    }

    const result = await honkTimer(roomId);
    return result.ok;
  }, [actionsDisabled, honkTimer, roomId]);

  const handleUpdateSettings = useCallback(
    async (settings: Partial<RoomSettings>) => {
      if (!roomId || actionsDisabled) {
        return false;
      }

      const result = await updateSettings(roomId, settings);
      return result.ok;
    },
    [actionsDisabled, roomId, updateSettings]
  );

  useEffect(() => {
    if (!roomState || actionsDisabled || connection.status !== "connected") {
      return;
    }

    const self = getSelf(roomState);
    if (!self || self.role !== "voter" || roomState.revealed) {
      return;
    }

    const availableCards = new Set(roomState.deck.cards);

    const handleKeyDown = (event: KeyboardEvent) => {
      const action = getRoomShortcutAction(event, availableCards, selectedCard);
      if (!action) {
        return;
      }

      event.preventDefault();
      if (action.type === "clear") {
        void handleClearVote();
      } else {
        void handleVote(action.value);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [actionsDisabled, connection.status, handleClearVote, handleVote, roomState, selectedCard]);

  if (roomUnavailable) {
    return (
      <div className="page-shell page-shell--centered">
        <a className="skip-link" href="#main">
          {t("common.skipToContent")}
        </a>
        <header className="status-corner" aria-label={t("room.sessionStatus")}>
          <ConnectionBadge status={connection.status} compatibilityMode={connection.compatibilityMode} />
          <LanguageSwitcher compact />
          <ThemeToggle />
        </header>

        <main id="main" className="app-panel empty-state">
          <div className="section-label">{t("room.roomUnavailable")}</div>
          <h1>{t("room.roomMissing")}</h1>
          <p>
            {roomUnavailable === "ROOM_EXPIRED" ? t("room.roomExpiredMessage") : t("room.roomMissingMessage")}
          </p>
          <button className="button button--primary" type="button" onClick={() => navigate("/")}>
            {t("room.createNewRoom")}
          </button>
        </main>
      </div>
    );
  }

  if (needsManualJoin && !roomState) {
    return (
      <div className="page-shell page-shell--centered">
        <a className="skip-link" href="#main">
          {t("common.skipToContent")}
        </a>
        <header className="status-corner" aria-label={t("room.sessionStatus")}>
          <ConnectionBadge status={connection.status} compatibilityMode={connection.compatibilityMode} />
          <LanguageSwitcher compact />
          <ThemeToggle />
        </header>

        <main id="main" className="app-panel empty-state empty-state--form">
          <form className="empty-state__form-body" onSubmit={handleManualJoin}>
            <div className="section-label">{t("room.manualJoin")}</div>
            <h1>{t("room.joinRoomTitle", { roomId })}</h1>
            <p>{t("room.manualJoinDescription")}</p>

            <label className="field">
              <span className="field__label">{t("landing.displayNameLabel")}</span>
              <input
                className="input"
                type="text"
                value={joinName}
                onChange={(event) => setJoinName(event.target.value)}
                placeholder={t("landing.displayNamePlaceholder")}
                maxLength={30}
              />
            </label>

            <div className="field">
              <span className="field__label" id="join-role-label">
                {t("landing.roleLabel")}
              </span>
              <div className="segmented" role="radiogroup" aria-labelledby="join-role-label">
                {JOIN_ROLE_OPTIONS.map((roleOption) => (
                  <button
                    key={roleOption}
                    ref={(element) => {
                      joinRoleRefs.current[roleOption] = element;
                    }}
                    type="button"
                    role="radio"
                    aria-checked={joinRole === roleOption}
                    tabIndex={joinRole === roleOption ? 0 : -1}
                    className={[
                      "segmented__option",
                      joinRole === roleOption ? "segmented__option--active" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    onClick={() => setJoinRole(roleOption)}
                    onKeyDown={(event) => handleJoinRoleKeyDown(event, roleOption)}
                  >
                    <span>{t(`roles.${roleOption}.label`)}</span>
                    <small>{t(`roles.${roleOption}.helper`)}</small>
                  </button>
                ))}
              </div>
            </div>

            <button
              className="button button--primary button--full"
              type="submit"
              disabled={!joinName.trim() || connection.status !== "connected"}
            >
              {t("landing.joinRoom")}
            </button>
          </form>
          {connection.showRecoveryNotice && (
            <ConnectionStatusNotice connection={connection} className="empty-state__connection-notice" />
          )}
        </main>

        <Toast toast={toast} />
      </div>
    );
  }

  if (!roomState) {
    return (
      <div className="page-shell page-shell--centered">
        <a className="skip-link" href="#main">
          {t("common.skipToContent")}
        </a>
        <header className="status-corner" aria-label={t("room.sessionStatus")}>
          <ConnectionBadge status={connection.status} compatibilityMode={connection.compatibilityMode} />
          <LanguageSwitcher compact />
          <ThemeToggle />
        </header>
        <main id="main" className="app-panel empty-state">
          <div className="section-label">{t("room.connecting")}</div>
          <h1>{t("room.joiningRoom")}</h1>
          <p>{t("room.waitingSnapshot")}</p>
          {connection.showRecoveryNotice && (
            <ConnectionStatusNotice connection={connection} className="empty-state__connection-notice" />
          )}
        </main>
      </div>
    );
  }

  const state = roomState;
  const inviteHeroVisible = shouldShowInviteHero(state);
  const storyAgendaVisible = shouldShowStoryAgenda(state, trackStories);
  const timerStripVisible = timerStripActivated || isTimerStripRelevant(state);

  return (
    <div className="page-shell room-page">
      <a className="skip-link" href="#main">
        {t("common.skipToContent")}
      </a>
      <TopBar
        state={state}
        connectionStatus={connection.status}
        compatibilityMode={connection.compatibilityMode}
        onLeave={handleLeave}
        onCopyFeedback={showToast}
        roomCodeCopyEnabled={!inviteHeroVisible}
        moderatorControls={
          <ModeratorControls
            compact
            surface="embedded"
            state={state}
            serverClockOffsetMs={serverClockOffsetMs}
            onSetTimerDuration={handleSetTimerDuration}
            onStartTimer={handleStartTimer}
            onPauseTimer={handlePauseTimer}
            onResetTimer={handleResetTimer}
            onHonkTimer={handleHonkTimer}
            onUpdateSettings={handleUpdateSettings}
            onTransferModerator={handleTransferModerator}
            onResetRound={handleReset}
            trackStories={trackStories}
            onTrackStoriesChange={setTrackStories}
            disabled={actionsDisabled}
          />
        }
        disabled={actionsDisabled}
      />

      <main id="main">
        <h1 className="sr-only">{t("room.roomHeading", { roomId })}</h1>
        {connection.showRecoveryNotice && <ConnectionStatusNotice connection={connection} />}

        {error?.code === "NOT_ALLOWED" && (
          <Banner tone="warning" title={t("room.actionBlocked")}>
            {error.message}
          </Banner>
        )}

        {sessionReplaced && (
          <section className="app-panel session-panel">
            <div className="section-label">{t("room.session")}</div>
            <h2>{t("room.readOnlyTitle")}</h2>
            <p>{t("room.readOnlyBody")}</p>
            <div className="session-panel__actions">
              <button
                className="button button--primary"
                type="button"
                onClick={handleRejoin}
                disabled={connection.status !== "connected"}
              >
                {t("room.takeControl")}
              </button>
              <button className="button button--ghost" type="button" onClick={handleCloseTab}>
                {t("room.closeTab")}
              </button>
            </div>
          </section>
        )}

        <div className="room-layout">
          <div className="room-layout__main room-layout__stage">
            {storyAgendaVisible ? (
              <StoryAgenda
                state={state}
                disabled={actionsDisabled}
                onUpdateStoryLabel={handleUpdateStoryLabel}
                onAddStoryAgendaItems={handleAddStoryAgendaItems}
                onRemoveStoryAgendaItem={handleRemoveStoryAgendaItem}
                onMoveStoryAgendaItem={handleMoveStoryAgendaItem}
                onStartNextStory={handleStartNextStory}
              />
            ) : null}
            {timerStripVisible ? (
              <TimerStrip state={state} serverClockOffsetMs={serverClockOffsetMs} />
            ) : null}
            <RoundActionBar
              state={state}
              onReveal={handleReveal}
              onReopenVoting={handleReopenVoting}
              onNextRound={handleNextRound}
              disabled={actionsDisabled}
            />
            {state.revealed ? (
              <ResultsPanel
                state={state}
                onCopyRoundSummary={isMeModerator(state) ? handleCopyRoundSummary : undefined}
                onOpenRoundReport={() => setRoundReportOpen(true)}
                roundReportButtonRef={roundReportButtonRef}
                onOpenSessionReport={
                  state.sessionRounds.length > 0 ? () => setSessionReportOpen(true) : undefined
                }
                onCopySessionSummary={
                  isMeModerator(state) && state.sessionRounds.length > 0
                    ? handleCopySessionSummary
                    : undefined
                }
                sessionReportButtonRef={sessionReportButtonRef}
              />
            ) : (
              <VoteDeck
                state={state}
                selectedCard={selectedCard}
                onVote={handleVote}
                onClearVote={handleClearVote}
                disabled={actionsDisabled}
              />
            )}
          </div>

          <aside className="room-layout__aside room-layout__participants">
            {inviteHeroVisible ? (
              <InviteHero roomId={state.id} onCopyError={showToast} />
            ) : (
              <ParticipantsBoard state={state} variant="rail" />
            )}
          </aside>
        </div>
      </main>

      {roundReportOpen && revealedAt !== null && state.revealed && (
        <RoundReportModal
          open
          state={state}
          revealedAt={revealedAt}
          mode={isMeModerator(state) ? "moderator" : "participant"}
          onClose={() => setRoundReportOpen(false)}
          returnFocusRef={roundReportButtonRef}
        />
      )}

      {sessionReportOpen && state.sessionRounds.length > 0 && (
        <SessionReportModal
          open
          roomId={state.id}
          sessionRounds={state.sessionRounds}
          mode={isMeModerator(state) ? "moderator" : "participant"}
          onClose={() => setSessionReportOpen(false)}
          returnFocusRef={sessionReportButtonRef}
        />
      )}

      <Toast toast={toast} />
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {liveAnnouncement}
      </div>
    </div>
  );
}
