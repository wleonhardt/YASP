import { useId } from "react";
import { useTranslation } from "react-i18next";
import type { PublicRoomState } from "@yasp/shared";
import { playTimerHonk, playTimerStart, primeRoomAudio } from "../lib/audio";
import { isMeModerator } from "../lib/room";
import { useTimerSoundPreference } from "../hooks/useTimerSoundPreference";
import { useRoomTimerCountdown } from "./RoomTimer";

type Props = {
  state: PublicRoomState;
  onReveal: () => void;
  onReopenVoting: () => void;
  onNextRound: () => void;
  onStartTimer?: () => Promise<boolean> | boolean;
  onHonkTimer?: () => Promise<boolean> | boolean;
  serverClockOffsetMs?: number;
  disabled?: boolean;
};

export function RoundActionBar({
  state,
  onReveal,
  onReopenVoting,
  onNextRound,
  onStartTimer,
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
  const showTimerShortcuts = isModerator && !state.revealed && onStartTimer && onHonkTimer;
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
    <section className="round-action-bar" aria-label={t("room.nextStep")}>
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
                <button
                  className="button button--ghost round-action-bar__shortcut"
                  type="button"
                  onClick={() => void handleStartTimer()}
                  disabled={disabled || state.timer.running}
                >
                  {t("room.timerStart")}
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
