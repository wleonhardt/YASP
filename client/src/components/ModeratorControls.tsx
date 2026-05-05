import { useEffect, useId, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { PublicRoomState } from "@yasp/shared";
import { useTimerSoundPreference } from "../hooks/useTimerSoundPreference";
import { getConnectedVoterCounts, isMeModerator } from "../lib/room";
import {
  RoomTimer,
  formatCountdown,
  formatTimerDuration,
  getRoomTimerStatus,
  useRoomTimerCountdown,
} from "./RoomTimer";
import { RoomSettingsPanel } from "./RoomSettingsPanel";

type Props = {
  compact: boolean;
  state: PublicRoomState;
  serverClockOffsetMs?: number;
  onUpdateSettings: (settings: Partial<PublicRoomState["settings"]>) => Promise<boolean> | boolean;
  onSetTimerDuration: (durationSeconds: number) => Promise<unknown> | unknown;
  onStartTimer: () => Promise<boolean> | boolean;
  onPauseTimer: () => Promise<unknown> | unknown;
  onResetTimer: () => Promise<unknown> | unknown;
  onHonkTimer: () => Promise<boolean> | boolean;
  onTransferModerator: (targetParticipantId: string) => Promise<boolean> | boolean;
  disabled?: boolean;
};

type PanelHeaderProps = {
  headingId: string;
  title: string;
  statusRail?: ReactNode;
};

type TimerSectionProps = {
  compact: boolean;
  expanded: boolean;
  sectionId: string;
  summaryLabel: string;
  onToggle: () => void;
  state: PublicRoomState;
  onSetTimerDuration: (durationSeconds: number) => Promise<unknown> | unknown;
  onStartTimer: () => Promise<boolean> | boolean;
  onPauseTimer: () => Promise<unknown> | unknown;
  onResetTimer: () => Promise<unknown> | unknown;
  onHonkTimer: () => Promise<boolean> | boolean;
  disabled: boolean;
  serverClockOffsetMs?: number;
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
  durationChipLabel?: string | null;
};

function ModeratorStatusChips({
  readyChipLabel,
  timerChipLabel,
  timerChipTone,
  durationChipLabel = null,
}: StatusChipsProps) {
  return (
    <>
      {readyChipLabel ? <span className="ui-chip ui-chip--success">{readyChipLabel}</span> : null}
      <span className={["ui-chip", timerChipTone].join(" ")}>{timerChipLabel}</span>
      {durationChipLabel ? <span className="ui-chip ui-chip--neutral">{durationChipLabel}</span> : null}
    </>
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
  disabled,
  serverClockOffsetMs = 0,
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
            compactActions
            serverClockOffsetMs={serverClockOffsetMs}
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
        serverClockOffsetMs={serverClockOffsetMs}
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

  if (!isModerator || transferCandidates.length === 0) {
    return null;
  }

  return (
    <div className="controls-panel__section controls-panel__section--transfer">
      <div className="controls-panel__transfer-header">
        <div className="controls-panel__transfer-copy">
          <div className="controls-panel__transfer-title">{t("room.transferHost")}</div>
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
  serverClockOffsetMs = 0,
  onUpdateSettings,
  onSetTimerDuration,
  onStartTimer,
  onPauseTimer,
  onResetTimer,
  onHonkTimer,
  onTransferModerator,
  disabled = false,
}: Props) {
  const { t } = useTranslation();
  const isModerator = isMeModerator(state);
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
  const transferSelectRef = useRef<HTMLSelectElement | null>(null);
  const [soundEnabled] = useTimerSoundPreference();
  const { remainingSeconds } = useRoomTimerCountdown(state.timer, serverClockOffsetMs);

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

  const drawerSummary = `${t("room.timerDuration")} ${formatTimerDuration(state.timer.durationSeconds)} \u2022 ${soundEnabled ? t("room.timerSoundOn") : t("room.timerSoundOff")}`;
  const durationChip = formatTimerDuration(state.timer.durationSeconds);
  const readyChipLabel = allVoted && !state.revealed ? t("room.participant.ready") : null;
  const transferDisabled = disabled || transferCandidates.length === 0;
  const timerStatus = getRoomTimerStatus(state.timer, remainingSeconds);
  const timerChipTone = timerStatus === "complete" ? "ui-chip--success" : "ui-chip--neutral";
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
            durationChipLabel={null}
          />
        </div>
      )}

      <div className="controls-panel__main">
        <TimerSection
          compact={compact}
          expanded={compact ? timerExpanded : true}
          sectionId={timerPanelId}
          summaryLabel={compact ? drawerSummary : ""}
          onToggle={() => {
            if (compact) {
              setTimerExpanded((value) => !value);
            }
          }}
          state={state}
          onSetTimerDuration={onSetTimerDuration}
          onStartTimer={onStartTimer}
          onPauseTimer={onPauseTimer}
          onResetTimer={onResetTimer}
          onHonkTimer={onHonkTimer}
          disabled={disabled}
          serverClockOffsetMs={serverClockOffsetMs}
        />
      </div>

      <RoomSettingsPanel state={state} onUpdateSettings={onUpdateSettings} disabled={disabled} />

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
