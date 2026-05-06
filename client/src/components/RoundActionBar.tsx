import { useId } from "react";
import { useTranslation } from "react-i18next";
import { ROOM_TIMER_MAX_SECONDS, ROOM_TIMER_MIN_SECONDS, type PublicRoomState } from "@yasp/shared";
import { playTimerHonk, playTimerStart, primeRoomAudio } from "../lib/audio";
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
  serverClockOffsetMs?: number;
  disabled?: boolean;
};

export function RoundActionBar({
  state,
  onReveal,
  onReopenVoting,
  onNextRound,
  onSetTimerDuration,
  onStartTimer,
  onPauseTimer,
  onHonkTimer,
  serverClockOffsetMs = 0,
  disabled = false,
}: Props) {
  const { t } = useTranslation();
  const hintId = useId();
  const [soundEnabled] = useTimerSoundPreference();
  const { honkCooldownSeconds } = useRoomTimerCountdown(state.timer, serverClockOffsetMs);
  const isModerator = isMeModerator(state);
  const revealAllowed = !disabled && (state.settings.revealPolicy === "anyone" || isModerator);
  const resetAllowed = !disabled && (state.settings.resetPolicy === "anyone" || isModerator);
  const showTimerShortcuts =
    isModerator && !state.revealed && onSetTimerDuration && onStartTimer && onPauseTimer && onHonkTimer;
  const durationMinutes = Math.floor(state.timer.durationSeconds / 60);
  const durationSeconds = state.timer.durationSeconds % 60;
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

  const commitTimerDuration = (minutes: number, seconds: number) => {
    if (!onSetTimerDuration) {
      return;
    }

    const nextDuration = Math.max(
      ROOM_TIMER_MIN_SECONDS,
      Math.min(ROOM_TIMER_MAX_SECONDS, minutes * 60 + seconds)
    );
    void onSetTimerDuration(nextDuration);
  };

  const parseDurationPart = (value: string): number => {
    const numeric = value.replace(/\D/g, "");
    return numeric ? Number(numeric) : 0;
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
                <fieldset
                  className="round-action-bar__duration"
                  disabled={disabled || state.timer.running}
                  aria-label={t("room.timerDuration")}
                >
                  <label className="round-action-bar__duration-part">
                    <span className="sr-only">{t("room.timerMinutes")}</span>
                    <input
                      className="round-action-bar__duration-input"
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={2}
                      value={String(durationMinutes).padStart(2, "0")}
                      onChange={(event) =>
                        commitTimerDuration(
                          Math.min(
                            Math.floor(ROOM_TIMER_MAX_SECONDS / 60),
                            parseDurationPart(event.target.value)
                          ),
                          durationSeconds
                        )
                      }
                      onWheel={(event) => event.currentTarget.blur()}
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
                      maxLength={2}
                      value={String(durationSeconds).padStart(2, "0")}
                      onChange={(event) =>
                        commitTimerDuration(
                          durationMinutes,
                          Math.min(59, parseDurationPart(event.target.value))
                        )
                      }
                      onWheel={(event) => event.currentTarget.blur()}
                    />
                    <span aria-hidden="true">s</span>
                  </label>
                </fieldset>
                <button
                  className="button button--ghost round-action-bar__shortcut"
                  type="button"
                  onClick={() => void (state.timer.running ? handlePauseTimer() : handleStartTimer())}
                  disabled={disabled}
                >
                  {state.timer.running ? t("room.timerPause") : t("room.timerStart")}
                </button>
                <button
                  className="button button--ghost round-action-bar__shortcut"
                  type="button"
                  onClick={() => void handleHonkTimer()}
                  disabled={disabled || honkCooldownSeconds > 0}
                  aria-label={honkLabel}
                >
                  {honkLabel}
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
