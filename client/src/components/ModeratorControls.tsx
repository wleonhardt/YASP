import { useEffect, useId, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { PublicRoomState } from "@yasp/shared";
import { getConnectedVoterCounts, isMeModerator } from "../lib/room";
import { getStoredTimerSoundEnabled } from "../lib/storage";
import {
  RoomTimer,
  formatCountdown,
  formatTimerDuration,
  getRoomTimerStatus,
  useRoomTimerCountdown,
} from "./RoomTimer";

type Props = {
  compact: boolean;
  state: PublicRoomState;
  onSetTimerDuration: (durationSeconds: number) => Promise<unknown> | unknown;
  onStartTimer: () => Promise<unknown> | unknown;
  onPauseTimer: () => Promise<unknown> | unknown;
  onResetTimer: () => Promise<unknown> | unknown;
  onHonkTimer: () => Promise<boolean> | boolean;
  onReveal: () => void;
  onReset: () => void;
  onNextRound: () => void;
  onTransferModerator: (targetParticipantId: string) => Promise<boolean> | boolean;
  disabled?: boolean;
};

type PanelHeaderProps = {
  headingId: string;
  title: string;
  statusRail?: ReactNode;
};

type NextStepSectionProps = {
  revealed: boolean;
  revealAllowed: boolean;
  resetAllowed: boolean;
  disabled: boolean;
  actionHint: string | null;
  actionHintId: string;
  onReveal: () => void;
  onReset: () => void;
  onNextRound: () => void;
};

type TimerSectionProps = {
  compact: boolean;
  expanded: boolean;
  sectionId: string;
  summaryLabel: string;
  onToggle: () => void;
  state: PublicRoomState;
  onSetTimerDuration: (durationSeconds: number) => Promise<unknown> | unknown;
  onStartTimer: () => Promise<unknown> | unknown;
  onPauseTimer: () => Promise<unknown> | unknown;
  onResetTimer: () => Promise<unknown> | unknown;
  onHonkTimer: () => Promise<boolean> | boolean;
  roundActions?: ReactNode;
  disabled: boolean;
};

type TransferSectionProps = {
  isModerator: boolean;
  disabled: boolean;
  transferOpen: boolean;
  transferDisabled: boolean;
  transferCandidates: PublicRoomState["participants"];
  targetParticipantId: string;
  transferPanelId: string;
  transferSelectRef: MutableRefObject<HTMLSelectElement | null>;
  confirming: boolean;
  setTargetParticipantId: (value: string) => void;
  setConfirming: (value: boolean) => void;
  onToggle: () => void;
  onClose: () => void;
  onTransfer: () => Promise<void>;
};

function PanelHeader({ headingId, title, statusRail = null }: PanelHeaderProps) {
  return (
    <div className="controls-panel__header">
      <div>
        <h2 id={headingId}>{title}</h2>
      </div>
      {statusRail ? <div className="controls-panel__status-rail">{statusRail}</div> : null}
    </div>
  );
}

type StatusChipsProps = {
  readyChipLabel: string | null;
  timerChipLabel: string;
  timerChipTone: "ui-chip--neutral" | "ui-chip--success";
  durationChipLabel: string;
};

function ModeratorStatusChips({
  readyChipLabel,
  timerChipLabel,
  timerChipTone,
  durationChipLabel,
}: StatusChipsProps) {
  return (
    <>
      {readyChipLabel ? <span className="ui-chip ui-chip--success">{readyChipLabel}</span> : null}
      <span className={["ui-chip", timerChipTone].join(" ")}>{timerChipLabel}</span>
      <span className="ui-chip ui-chip--neutral">{durationChipLabel}</span>
    </>
  );
}

function NextStepSection({
  revealed,
  revealAllowed,
  resetAllowed,
  disabled,
  actionHint,
  actionHintId,
  onReveal,
  onReset,
  onNextRound,
}: NextStepSectionProps) {
  const { t } = useTranslation();

  return (
    <div className="controls-panel__section controls-panel__section--next-step">
      <div className="controls-panel__section-header">
        <div className="section-label">{t("room.nextStep")}</div>
        <p className="controls-panel__section-state">
          {revealed ? t("room.phase.revealed") : t("room.phase.voting")}
        </p>
      </div>

      <div className="controls-panel__buttons">
        {!revealed ? (
          <button
            className="button button--primary button--full controls-panel__primary-action"
            onClick={onReveal}
            disabled={!revealAllowed}
            aria-describedby={!revealAllowed && actionHint ? actionHintId : undefined}
          >
            {t("room.revealVotes")}
          </button>
        ) : (
          <>
            <button
              className="button button--primary button--full controls-panel__primary-action"
              onClick={onNextRound}
              disabled={!resetAllowed}
              aria-describedby={!resetAllowed && actionHint ? actionHintId : undefined}
            >
              {t("room.nextRound")}
            </button>
            <button
              className="button button--secondary button--full controls-panel__secondary-action"
              onClick={onReset}
              disabled={!resetAllowed || disabled}
              aria-describedby={!resetAllowed && actionHint ? actionHintId : undefined}
            >
              {t("room.reset")}
            </button>
          </>
        )}
      </div>

      {actionHint ? (
        <p className="controls-panel__hint" id={actionHintId}>
          {actionHint}
        </p>
      ) : null}
    </div>
  );
}

function TimerSection({
  compact,
  expanded,
  sectionId,
  summaryLabel,
  onToggle,
  state,
  onSetTimerDuration,
  onStartTimer,
  onPauseTimer,
  onResetTimer,
  onHonkTimer,
  roundActions = null,
  disabled,
}: TimerSectionProps) {
  const { t } = useTranslation();
  return compact ? (
    <div className="controls-panel__timer-shell">
      <button
        type="button"
        className="controls-panel__disclosure"
        aria-expanded={expanded}
        aria-controls={sectionId}
        onClick={onToggle}
      >
        <span className="controls-panel__disclosure-copy">
          <span className="section-label">{t("room.timerSettings")}</span>
          {!expanded && <span className="controls-panel__disclosure-state">{summaryLabel}</span>}
        </span>
        <svg
          className={[
            "controls-panel__disclosure-chevron",
            expanded ? "controls-panel__disclosure-chevron--open" : "",
          ].join(" ")}
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {expanded ? (
        <div className="controls-panel__timer-content" id={sectionId}>
          <RoomTimer
            state={state}
            onSetDuration={onSetTimerDuration}
            onStart={onStartTimer}
            onPause={onPauseTimer}
            onReset={onResetTimer}
            onHonk={onHonkTimer}
            disabled={disabled}
            variant="embedded"
            headingLevel="h3"
            showSectionLabel={false}
            showStatusChip={false}
            roundActions={roundActions}
          />
        </div>
      ) : null}
    </div>
  ) : (
    <div className="controls-panel__section controls-panel__section--timer" id={sectionId}>
      <div className="section-label">{t("room.timerSettings")}</div>
      <RoomTimer
        state={state}
        onSetDuration={onSetTimerDuration}
        onStart={onStartTimer}
        onPause={onPauseTimer}
        onReset={onResetTimer}
        onHonk={onHonkTimer}
        disabled={disabled}
        variant="embedded"
        headingLevel="h3"
        showSectionLabel={false}
        showStatusChip={false}
        roundActions={roundActions}
      />
    </div>
  );
}

function TransferSection({
  isModerator,
  disabled,
  transferOpen,
  transferDisabled,
  transferCandidates,
  targetParticipantId,
  transferPanelId,
  transferSelectRef,
  confirming,
  setTargetParticipantId,
  setConfirming,
  onToggle,
  onClose,
  onTransfer,
}: TransferSectionProps) {
  const { t } = useTranslation();

  if (!isModerator) {
    return null;
  }

  const disabledReason = !transferCandidates.length ? t("room.addParticipantBeforeTransfer") : null;

  return (
    <div className="controls-panel__section controls-panel__section--transfer">
      <div className="controls-panel__transfer-header">
        <div className="controls-panel__transfer-copy">
          <div className="controls-panel__transfer-title">{t("room.transferHost")}</div>
          {transferDisabled && disabledReason ? (
            <p className="controls-panel__hint">{disabledReason}</p>
          ) : null}
        </div>
        <button
          className="button button--ghost controls-panel__transfer-trigger"
          type="button"
          onClick={onToggle}
          aria-expanded={transferDisabled ? undefined : transferOpen}
          aria-controls={transferDisabled ? undefined : transferPanelId}
          disabled={transferDisabled}
        >
          {t("room.transfer")}
        </button>
      </div>

      {!transferDisabled && transferOpen ? (
        <div
          className="controls-panel__transfer-disclosure"
          id={transferPanelId}
          role="group"
          aria-label={t("room.transferHost")}
        >
          {confirming ? (
            <div className="controls-panel__transfer-confirm">
              <div className="section-label">{t("room.confirmTransfer")}</div>
              <p className="controls-panel__hint">
                {t("room.transferConfirmMessage", {
                  name:
                    transferCandidates.find((participant) => participant.id === targetParticipantId)?.name ??
                    "",
                })}
              </p>
              <div className="controls-panel__transfer-actions">
                <button
                  className="button button--danger"
                  type="button"
                  onClick={() => void onTransfer()}
                  disabled={disabled}
                >
                  {t("room.yesTransfer")}
                </button>
                <button
                  className="button button--ghost"
                  type="button"
                  onClick={() => setConfirming(false)}
                  disabled={disabled}
                >
                  {t("room.back")}
                </button>
              </div>
            </div>
          ) : (
            <div className="controls-panel__transfer-row">
              <label className="field controls-panel__transfer-field">
                <span className="field__label">{t("room.newModerator")}</span>
                <select
                  ref={transferSelectRef}
                  className="input"
                  value={targetParticipantId}
                  onChange={(event) => setTargetParticipantId(event.target.value)}
                  disabled={disabled}
                >
                  {transferCandidates.map((participant) => (
                    <option key={participant.id} value={participant.id}>
                      {participant.name}
                      {participant.connected ? "" : ` (${t("room.participant.offline").toLowerCase()})`}
                    </option>
                  ))}
                </select>
              </label>

              <div className="controls-panel__transfer-actions">
                <button
                  className="button button--secondary"
                  type="button"
                  onClick={() => void onTransfer()}
                  disabled={disabled || !targetParticipantId}
                >
                  {t("room.transfer")}
                </button>
                <button className="button button--ghost" type="button" onClick={onClose} disabled={disabled}>
                  {t("room.cancel")}
                </button>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

export function ModeratorControls({
  compact,
  state,
  onSetTimerDuration,
  onStartTimer,
  onPauseTimer,
  onResetTimer,
  onHonkTimer,
  onReveal,
  onReset,
  onNextRound,
  onTransferModerator,
  disabled = false,
}: Props) {
  const { t } = useTranslation();
  const isModerator = isMeModerator(state);
  const revealAllowed = !disabled && (state.settings.revealPolicy === "anyone" || isModerator);
  const resetAllowed = !disabled && (state.settings.resetPolicy === "anyone" || isModerator);
  const { voted, total } = getConnectedVoterCounts(state);
  const allVoted = total > 0 && voted === total;
  const transferCandidates = useMemo(
    () => state.participants.filter((participant) => participant.id !== state.me.participantId),
    [state.me.participantId, state.participants]
  );
  const [transferOpen, setTransferOpen] = useState(false);
  const [timerExpanded, setTimerExpanded] = useState(!compact);
  const compactRef = useRef(compact);
  const [confirming, setConfirming] = useState(false);
  const [targetParticipantId, setTargetParticipantId] = useState(transferCandidates[0]?.id ?? "");
  const headingId = useId();
  const transferPanelId = useId();
  const timerPanelId = useId();
  const actionHintId = useId();
  const transferSelectRef = useRef<HTMLSelectElement | null>(null);
  const { remainingSeconds } = useRoomTimerCountdown(state.timer);
  const actionHint =
    !isModerator &&
    ((state.revealed && state.settings.resetPolicy === "moderator_only") ||
      (!state.revealed && state.settings.revealPolicy === "moderator_only"))
      ? state.revealed
        ? t("room.onlyModeratorAdvanceReset")
        : t("room.onlyModeratorReveal")
      : null;

  useEffect(() => {
    setTimerExpanded((current) => {
      if (!compact) {
        return true;
      }

      if (!compactRef.current && compact) {
        return false;
      }

      return current;
    });
    compactRef.current = compact;
  }, [compact]);

  useEffect(() => {
    if (!transferCandidates.some((participant) => participant.id === targetParticipantId)) {
      setTargetParticipantId(transferCandidates[0]?.id ?? "");
    }
  }, [targetParticipantId, transferCandidates]);

  useEffect(() => {
    if (!isModerator || disabled) {
      setTransferOpen(false);
      setConfirming(false);
    }
  }, [disabled, isModerator]);

  useEffect(() => {
    if (!transferOpen || transferCandidates.length === 0) {
      return;
    }

    transferSelectRef.current?.focus();
  }, [transferCandidates.length, transferOpen]);

  useEffect(() => {
    if (!transferOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (confirming) {
          setConfirming(false);
        } else {
          setTransferOpen(false);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [confirming, transferOpen]);

  const closeTransfer = () => {
    setTransferOpen(false);
    setConfirming(false);
  };

  const handleTransfer = async () => {
    const target = transferCandidates.find((participant) => participant.id === targetParticipantId);
    if (!target) {
      return;
    }

    if (!confirming) {
      setConfirming(true);
      return;
    }

    const transferred = await onTransferModerator(target.id);
    if (transferred) {
      closeTransfer();
    }
  };

  const timerSummaryChip =
    state.timer.completedAt && remainingSeconds === 0
      ? `\u23f1 ${t("room.timerState.complete")}`
      : state.timer.running
        ? `\u23f1 ${formatCountdown(remainingSeconds)}`
        : `${t("room.timer")} ${formatTimerDuration(state.timer.durationSeconds)}`;

  const drawerSummary = `${t("room.timerDuration")} ${formatTimerDuration(state.timer.durationSeconds)} \u2022 ${getStoredTimerSoundEnabled() ? t("room.timerSoundOn") : t("room.timerSoundOff")}`;
  const durationChip = formatTimerDuration(state.timer.durationSeconds);
  const readyChipLabel = allVoted && !state.revealed ? t("room.participant.ready") : null;
  const transferDisabled = disabled || transferCandidates.length === 0;
  const timerStatus = getRoomTimerStatus(state.timer, remainingSeconds);
  const timerChipTone = timerStatus === "complete" ? "ui-chip--success" : "ui-chip--neutral";
  const desktopRoundActions = compact ? null : (
    <>
      {state.revealed ? (
        <button
          className="button button--secondary room-timer__round-secondary"
          type="button"
          onClick={onReset}
          disabled={!resetAllowed || disabled}
          aria-describedby={!resetAllowed && actionHint ? actionHintId : undefined}
        >
          {t("room.reset")}
        </button>
      ) : null}
      <button
        className="button button--primary room-timer__round-primary"
        type="button"
        onClick={state.revealed ? onNextRound : onReveal}
        disabled={state.revealed ? !resetAllowed : !revealAllowed}
        aria-describedby={
          (state.revealed ? !resetAllowed : !revealAllowed) && actionHint ? actionHintId : undefined
        }
      >
        {state.revealed ? t("room.nextRound") : t("room.revealVotes")}
      </button>
    </>
  );
  const headerStatusRail = compact ? null : (
    <ModeratorStatusChips
      readyChipLabel={readyChipLabel}
      timerChipLabel={timerSummaryChip}
      timerChipTone={timerChipTone}
      durationChipLabel={durationChip}
    />
  );

  return (
    <section
      className={["app-panel controls-panel", compact ? "controls-panel--compact" : ""]
        .filter(Boolean)
        .join(" ")}
      aria-labelledby={headingId}
    >
      <PanelHeader headingId={headingId} title={t("room.moderatorControls")} statusRail={headerStatusRail} />

      {compact && (
        <div className="controls-panel__status-row">
          <ModeratorStatusChips
            readyChipLabel={readyChipLabel}
            timerChipLabel={timerSummaryChip}
            timerChipTone={timerChipTone}
            durationChipLabel={durationChip}
          />
        </div>
      )}

      <div className="controls-panel__main">
        {compact ? (
          <>
            <NextStepSection
              revealed={state.revealed}
              revealAllowed={revealAllowed}
              resetAllowed={resetAllowed}
              disabled={disabled}
              actionHint={actionHint}
              actionHintId={actionHintId}
              onReveal={onReveal}
              onReset={onReset}
              onNextRound={onNextRound}
            />
            <TimerSection
              compact
              expanded={timerExpanded}
              sectionId={timerPanelId}
              summaryLabel={drawerSummary}
              onToggle={() => setTimerExpanded((value) => !value)}
              state={state}
              onSetTimerDuration={onSetTimerDuration}
              onStartTimer={onStartTimer}
              onPauseTimer={onPauseTimer}
              onResetTimer={onResetTimer}
              onHonkTimer={onHonkTimer}
              roundActions={null}
              disabled={disabled}
            />
          </>
        ) : (
          <TimerSection
            compact={false}
            expanded
            sectionId={timerPanelId}
            summaryLabel=""
            onToggle={() => undefined}
            state={state}
            onSetTimerDuration={onSetTimerDuration}
            onStartTimer={onStartTimer}
            onPauseTimer={onPauseTimer}
            onResetTimer={onResetTimer}
            onHonkTimer={onHonkTimer}
            roundActions={desktopRoundActions}
            disabled={disabled}
          />
        )}
      </div>

      <TransferSection
        isModerator={isModerator}
        disabled={disabled}
        transferOpen={transferOpen}
        transferDisabled={transferDisabled}
        transferCandidates={transferCandidates}
        targetParticipantId={targetParticipantId}
        transferPanelId={transferPanelId}
        transferSelectRef={transferSelectRef}
        confirming={confirming}
        setTargetParticipantId={setTargetParticipantId}
        setConfirming={setConfirming}
        onToggle={() => {
          setTransferOpen((open) => !open);
          setConfirming(false);
        }}
        onClose={closeTransfer}
        onTransfer={handleTransfer}
      />
    </section>
  );
}
