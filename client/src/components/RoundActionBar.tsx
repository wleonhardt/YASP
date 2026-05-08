import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ROOM_TIMER_MAX_SECONDS, ROOM_TIMER_MIN_SECONDS, type PublicRoomState } from "@yasp/shared";
import { isRoomAudioPrimed, playTimerComplete, playTimerHonk, playTimerStart, playTimerTick, primeRoomAudio } from "../lib/audio";
import { isMeModerator } from "../lib/room";
import { useTimerSoundPreference } from "../hooks/useTimerSoundPreference";
import { useRoomTimerCountdown } from "./RoomTimer";

type Props = {
  state: PublicRoomState;
  onReveal: () => void;
  onReopenVoting: () => void;
  onNextRound: () => void;
  onSetTimerDuration?: (durationSeconds: number) => Promise<unknown> | unknown;
  onStartTimer?: () => Promise<boolean> | boolean;
  onPauseTimer?: () => Promise<unknown> | unknown;
  onHonkTimer?: () => Promise<boolean> | boolean;
  onOpenSettings?: () => void;
  serverClockOffsetMs?: number;
  disabled?: boolean;
};

function PlayIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M8 6.5v11l8.5-5.5L8 6.5Z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M7 5h4v14H7zM13 5h4v14h-4z" />
    </svg>
  );
}

function HonkIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M12 6a4 4 0 0 1 4 4v3.5l1.5 2.5h-11L8 13.5V10a4 4 0 0 1 4-4Z" />
      <path d="M10 18a2 2 0 0 0 4 0" />
      <path d="M18 8.5a6.5 6.5 0 0 1 0 7" />
      <path d="M6 15.5a6.5 6.5 0 0 1 0-7" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
    </svg>
  );
}

export function RoundActionBar({
  state,
  onReveal,
  onReopenVoting,
  onNextRound,
  onSetTimerDuration,
  onStartTimer,
  onPauseTimer,
  onHonkTimer,
  onOpenSettings,
  serverClockOffsetMs = 0,
  disabled = false,
}: Props) {
  const { t } = useTranslation();
  const hintId = useId();
  const [soundEnabled] = useTimerSoundPreference();
  const { honkCooldownSeconds, remainingSeconds } = useRoomTimerCountdown(state.timer, serverClockOffsetMs);
  const isModerator = isMeModerator(state);
  const revealAllowed = !disabled && (state.settings.revealPolicy === "anyone" || isModerator);
  const resetAllowed = !disabled && (state.settings.resetPolicy === "anyone" || isModerator);
  const showTimerShortcuts =
    isModerator && !state.revealed && onSetTimerDuration && onStartTimer && onPauseTimer && onHonkTimer;
  const serverMinutes = Math.floor(state.timer.durationSeconds / 60);
  const serverSeconds = state.timer.durationSeconds % 60;
  const [minutesInput, setMinutesInput] = useState(() => String(serverMinutes).padStart(2, "0"));
  const [secondsInput, setSecondsInput] = useState(() => String(serverSeconds).padStart(2, "0"));
  const minutesFocused = useRef(false);
  const secondsFocused = useRef(false);
  const previousRemainingSeconds = useRef(remainingSeconds);
  const previousCompletedAt = useRef(state.timer.completedAt);

  useEffect(() => {
    if (!minutesFocused.current) setMinutesInput(String(serverMinutes).padStart(2, "0"));
  }, [serverMinutes]);

  useEffect(() => {
    if (!secondsFocused.current) setSecondsInput(String(serverSeconds).padStart(2, "0"));
  }, [serverSeconds]);

  useEffect(() => {
    if (soundEnabled && isRoomAudioPrimed()) {
      if (
        state.timer.running &&
        remainingSeconds > 0 &&
        remainingSeconds <= 10 &&
        remainingSeconds < previousRemainingSeconds.current
      ) {
        void playTimerTick(remainingSeconds <= 5 ? "fast" : "slow");
      }
      if (state.timer.completedAt !== null && state.timer.completedAt !== previousCompletedAt.current) {
        void playTimerComplete();
      }
    }
    previousRemainingSeconds.current = remainingSeconds;
    previousCompletedAt.current = state.timer.completedAt;
  }, [remainingSeconds, soundEnabled, state.timer.running, state.timer.completedAt]);

  const honkLabel =
    honkCooldownSeconds > 0 ? `${t("room.timerHonk")} (${honkCooldownSeconds})` : t("room.timerHonk");
  const actionHint =
    !isModerator &&
    ((state.revealed && state.settings.resetPolicy === "moderator_only") ||
      (!state.revealed && state.settings.revealPolicy === "moderator_only"))
      ? state.revealed
        ? t("room.onlyModeratorAdvanceReopen")
        : t("room.onlyModeratorReveal")
      : null;

  const primaryDisabled = state.revealed ? !resetAllowed : !revealAllowed;

  const parseDurationPart = (value: string): number => {
    const numeric = value.replace(/\D/g, "");
    return numeric ? Number(numeric) : 0;
  };

  const commitTimerDuration = (minutes: number, seconds: number) => {
    if (!onSetTimerDuration) return;
    const clamped = Math.max(ROOM_TIMER_MIN_SECONDS, Math.min(ROOM_TIMER_MAX_SECONDS, minutes * 60 + seconds));
    void onSetTimerDuration(clamped);
  };

  const handleMinutesBlur = () => {
    minutesFocused.current = false;
    const m = Math.min(Math.floor(ROOM_TIMER_MAX_SECONDS / 60), parseDurationPart(minutesInput));
    const s = parseDurationPart(secondsInput);
    setMinutesInput(String(m).padStart(2, "0"));
    commitTimerDuration(m, s);
  };

  const handleSecondsBlur = () => {
    secondsFocused.current = false;
    const m = parseDurationPart(minutesInput);
    const s = Math.min(59, parseDurationPart(secondsInput));
    setSecondsInput(String(s).padStart(2, "0"));
    commitTimerDuration(m, s);
  };

  const handleStartTimer = async () => {
    if (!onStartTimer) {
      return;
    }

    const audioReady = soundEnabled ? await primeRoomAudio() : false;
    const ok = await onStartTimer();
    if (ok && soundEnabled && audioReady) {
      void playTimerStart();
    }
  };

  const handlePauseTimer = async () => {
    if (!onPauseTimer) {
      return;
    }

    await onPauseTimer();
  };

  const handleHonkTimer = async () => {
    if (!onHonkTimer) {
      return;
    }

    const audioReady = await primeRoomAudio();
    const ok = await onHonkTimer();
    if (ok && audioReady) {
      void playTimerHonk();
    }
  };

  return (
    <section
      className={["round-action-bar", showTimerShortcuts ? "round-action-bar--with-timer-shortcuts" : ""]
        .filter(Boolean)
        .join(" ")}
      aria-label={t("room.nextStep")}
    >
      {/* Invariant: the current round phase has one primary CTA; timer shortcuts stay secondary. */}
      <div
        className={["round-action-bar__actions", state.revealed ? "round-action-bar__actions--revealed" : ""]
          .filter(Boolean)
          .join(" ")}
      >
        {state.revealed ? (
          <>
            <button
              className="button button--primary round-action-bar__primary"
              type="button"
              onClick={onNextRound}
              disabled={primaryDisabled}
              aria-describedby={primaryDisabled && actionHint ? hintId : undefined}
            >
              {t("room.nextRound")}
            </button>
            <button
              className="round-action-bar__text-action"
              type="button"
              onClick={onReopenVoting}
              disabled={!resetAllowed || disabled}
              aria-describedby={!resetAllowed && actionHint ? hintId : undefined}
            >
              {t("room.reopenVotingAlternative")}
            </button>
          </>
        ) : (
          <>
            {showTimerShortcuts ? (
              <div className="round-action-bar__timer-shortcuts" role="group" aria-label={t("room.timer")}>
                {onOpenSettings ? (
                  <button
                    className="button button--ghost round-action-bar__shortcut round-action-bar__shortcut--icon"
                    type="button"
                    onClick={onOpenSettings}
                    disabled={disabled}
                    aria-label={t("room.moderatorControls")}
                    title={t("room.moderatorControls")}
                  >
                    <GearIcon />
                  </button>
                ) : null}
                <fieldset
                  className="round-action-bar__duration"
                  disabled={disabled || state.timer.running}
                  aria-label={t("room.timerDuration")}
                >
                  <div className="round-action-bar__duration-inner">
                    <label className="round-action-bar__duration-part">
                      <span className="sr-only">{t("room.timerMinutes")}</span>
                      <input
                        className="round-action-bar__duration-input"
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={minutesInput}
                        onChange={(e) => setMinutesInput(e.target.value.replace(/\D/g, ""))}
                        onFocus={(e) => { minutesFocused.current = true; const el = e.currentTarget; setTimeout(() => el.select(), 0); }}
                        onBlur={handleMinutesBlur}
                        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                        onWheel={(e) => e.currentTarget.blur()}
                      />
                      <span aria-hidden="true">m</span>
                    </label>
                    <label className="round-action-bar__duration-part">
                      <span className="sr-only">{t("room.timerSeconds")}</span>
                      <input
                        className="round-action-bar__duration-input"
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={secondsInput}
                        onChange={(e) => setSecondsInput(e.target.value.replace(/\D/g, ""))}
                        onFocus={(e) => { secondsFocused.current = true; const el = e.currentTarget; setTimeout(() => el.select(), 0); }}
                        onBlur={handleSecondsBlur}
                        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                        onWheel={(e) => e.currentTarget.blur()}
                      />
                      <span aria-hidden="true">s</span>
                    </label>
                  </div>
                </fieldset>
                <button
                  className="button button--ghost round-action-bar__shortcut round-action-bar__shortcut--icon"
                  type="button"
                  onClick={() => void (state.timer.running ? handlePauseTimer() : handleStartTimer())}
                  disabled={disabled}
                  aria-label={state.timer.running ? t("room.timerPause") : t("room.timerStart")}
                  title={state.timer.running ? t("room.timerPause") : t("room.timerStart")}
                >
                  {state.timer.running ? <PauseIcon /> : <PlayIcon />}
                </button>
                <button
                  className="button button--ghost round-action-bar__shortcut round-action-bar__shortcut--icon"
                  type="button"
                  onClick={() => void handleHonkTimer()}
                  disabled={disabled || honkCooldownSeconds > 0}
                  aria-label={honkLabel}
                  title={honkLabel}
                >
                  {honkCooldownSeconds > 0 ? (
                    <span className="round-action-bar__shortcut-badge">{honkCooldownSeconds}</span>
                  ) : null}
                  <HonkIcon />
                </button>
              </div>
            ) : null}
            <button
              className="button button--primary round-action-bar__primary"
              type="button"
              onClick={onReveal}
              disabled={primaryDisabled}
              aria-describedby={primaryDisabled && actionHint ? hintId : undefined}
            >
              {t("room.revealVotes")}
            </button>
          </>
        )}
      </div>

      {actionHint ? (
        <p className="round-action-bar__hint" id={hintId}>
          {actionHint}
        </p>
      ) : null}
    </section>
  );
}
