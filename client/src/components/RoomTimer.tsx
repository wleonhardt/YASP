import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ROOM_TIMER_PRESET_SECONDS, type PublicRoomState } from "@yasp/shared";
import { playGentleChime, primeChimeAudio } from "../lib/audio";
import { isMeModerator } from "../lib/room";
import { getStoredTimerSoundEnabled, setStoredTimerSoundEnabled } from "../lib/storage";

type Props = {
  state: PublicRoomState;
  onSetDuration: (durationSeconds: number) => Promise<unknown> | unknown;
  onStart: () => Promise<unknown> | unknown;
  onPause: () => Promise<unknown> | unknown;
  onReset: () => Promise<unknown> | unknown;
  onHonk: () => Promise<unknown> | unknown;
  disabled?: boolean;
};

function formatCountdown(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

const ROOM_TIMER_PRESETS = Array.isArray(ROOM_TIMER_PRESET_SECONDS)
  ? ROOM_TIMER_PRESET_SECONDS
  : ([30, 60, 120, 300] as const);

export function RoomTimer({
  state,
  onSetDuration,
  onStart,
  onPause,
  onReset,
  onHonk,
  disabled = false,
}: Props) {
  const { t } = useTranslation();
  const moderator = isMeModerator(state);
  const [soundEnabled, setSoundEnabled] = useState(getStoredTimerSoundEnabled);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const headingId = useId();
  const hasMounted = useRef(false);
  const previousCompletedAt = useRef<number | null>(state.timer.completedAt);
  const previousHonkAt = useRef<number | null>(state.timer.lastHonkAt);

  const remainingSeconds = useMemo(() => {
    if (!state.timer.running || state.timer.endsAt === null) {
      return state.timer.remainingSeconds;
    }

    return Math.max(0, Math.ceil((state.timer.endsAt - nowMs) / 1000));
  }, [nowMs, state.timer.endsAt, state.timer.remainingSeconds, state.timer.running]);

  const honkCooldownSeconds =
    state.timer.honkAvailableAt && state.timer.honkAvailableAt > nowMs
      ? Math.ceil((state.timer.honkAvailableAt - nowMs) / 1000)
      : 0;

  const timerStateLabel = state.timer.running
    ? t("room.timerState.running")
    : state.timer.completedAt && remainingSeconds === 0
      ? t("room.timerState.complete")
      : remainingSeconds < state.timer.durationSeconds
        ? t("room.timerState.paused")
        : t("room.timerState.ready");

  useEffect(() => {
    setStoredTimerSoundEnabled(soundEnabled);
  }, [soundEnabled]);

  useEffect(() => {
    if (!state.timer.running && honkCooldownSeconds === 0) {
      return;
    }

    const interval = window.setInterval(() => {
      setNowMs(Date.now());
    }, 250);

    return () => window.clearInterval(interval);
  }, [honkCooldownSeconds, state.timer.running]);

  useEffect(() => {
    if (!hasMounted.current) {
      hasMounted.current = true;
      previousCompletedAt.current = state.timer.completedAt;
      previousHonkAt.current = state.timer.lastHonkAt;
      return;
    }

    if (!soundEnabled) {
      previousCompletedAt.current = state.timer.completedAt;
      previousHonkAt.current = state.timer.lastHonkAt;
      return;
    }

    if (state.timer.completedAt !== null && state.timer.completedAt !== previousCompletedAt.current) {
      void playGentleChime();
    } else if (state.timer.lastHonkAt !== null && state.timer.lastHonkAt !== previousHonkAt.current) {
      void playGentleChime();
    }

    previousCompletedAt.current = state.timer.completedAt;
    previousHonkAt.current = state.timer.lastHonkAt;
  }, [soundEnabled, state.timer.completedAt, state.timer.lastHonkAt]);

  const handleToggleSound = async () => {
    if (!soundEnabled) {
      await primeChimeAudio();
    }
    setSoundEnabled((value) => !value);
  };

  const prepareAudioAndRun = async (action: () => Promise<unknown> | unknown) => {
    if (soundEnabled) {
      await primeChimeAudio();
    }
    await action();
  };

  return (
    <section className="app-panel room-timer" aria-labelledby={headingId}>
      <div className="room-timer__summary">
        <div>
          <div className="section-label">{t("room.timer")}</div>
          <h2 id={headingId} className="room-timer__value">
            {formatCountdown(remainingSeconds)}
          </h2>
        </div>
        <div className={["ui-chip", state.timer.completedAt && remainingSeconds === 0 ? "ui-chip--success" : "ui-chip--neutral"].join(" ")}>
          {timerStateLabel}
        </div>
      </div>

      <div className="room-timer__controls">
        <label className="field room-timer__duration">
          <span className="field__label">{t("room.timerDuration")}</span>
          <select
            className="input"
            value={state.timer.durationSeconds}
            onChange={(event) => {
              const nextDuration = Number(event.target.value);
              void prepareAudioAndRun(() => onSetDuration(nextDuration));
            }}
            disabled={disabled || !moderator || state.timer.running}
          >
            {ROOM_TIMER_PRESETS.map((value) => (
              <option key={value} value={value}>
                {value < 60 ? `${value}s` : `${value / 60}m`}
              </option>
            ))}
          </select>
        </label>

        <div className="room-timer__actions">
          {moderator && (
            <>
              {state.timer.running ? (
                <button
                  className="button button--secondary"
                  type="button"
                  onClick={() => void prepareAudioAndRun(onPause)}
                  disabled={disabled}
                >
                  {t("room.timerPause")}
                </button>
              ) : (
                <button
                  className="button button--primary"
                  type="button"
                  onClick={() => void prepareAudioAndRun(onStart)}
                  disabled={disabled}
                >
                  {t("room.timerStart")}
                </button>
              )}

              <button
                className="button button--ghost"
                type="button"
                onClick={() => void prepareAudioAndRun(onReset)}
                disabled={disabled}
              >
                {t("room.timerReset")}
              </button>

              <button
                className="button button--ghost"
                type="button"
                onClick={() => void prepareAudioAndRun(onHonk)}
                disabled={disabled || honkCooldownSeconds > 0}
              >
                {honkCooldownSeconds > 0 ? `${t("room.timerHonk")} (${honkCooldownSeconds})` : t("room.timerHonk")}
              </button>
            </>
          )}

          <button
            className={["button", soundEnabled ? "button--secondary" : "button--ghost"].join(" ")}
            type="button"
            onClick={() => void handleToggleSound()}
          >
            {soundEnabled ? t("room.timerSoundOn") : t("room.timerSoundOff")}
          </button>
        </div>
      </div>
    </section>
  );
}
