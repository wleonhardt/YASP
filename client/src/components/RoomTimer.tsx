import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ROOM_TIMER_PRESET_SECONDS, type PublicRoomState } from "@yasp/shared";
import { playTimerComplete, playTimerHonk, playTimerStart, playTimerTick, primeRoomAudio } from "../lib/audio";
import { isMeModerator } from "../lib/room";
import { getStoredTimerSoundEnabled, setStoredTimerSoundEnabled } from "../lib/storage";

export type RoomTimerStatus = "running" | "complete" | "paused" | "ready";

type Props = {
  state: PublicRoomState;
  onSetDuration: (durationSeconds: number) => Promise<unknown> | unknown;
  onStart: () => Promise<unknown> | unknown;
  onPause: () => Promise<unknown> | unknown;
  onReset: () => Promise<unknown> | unknown;
  onHonk: () => Promise<boolean> | boolean;
  disabled?: boolean;
  variant?: "panel" | "embedded";
  headingLevel?: "h2" | "h3";
  className?: string;
  showSectionLabel?: boolean;
  showStatusChip?: boolean;
  roundActions?: ReactNode;
};

export function formatCountdown(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function formatTimerDuration(totalSeconds: number): string {
  return totalSeconds < 60 ? `${totalSeconds}s` : `${totalSeconds / 60}m`;
}

export function getRoomTimerStatus(
  timer: PublicRoomState["timer"],
  remainingSeconds: number
): RoomTimerStatus {
  if (timer.running) {
    return "running";
  }
  if (timer.completedAt && remainingSeconds === 0) {
    return "complete";
  }
  if (remainingSeconds < timer.durationSeconds) {
    return "paused";
  }
  return "ready";
}

export function useRoomTimerCountdown(timer: PublicRoomState["timer"]): {
  remainingSeconds: number;
  honkCooldownSeconds: number;
} {
  const [nowMs, setNowMs] = useState(() => Date.now());

  const remainingSeconds = useMemo(() => {
    if (!timer.running || timer.endsAt === null) {
      return timer.remainingSeconds;
    }

    return Math.max(0, Math.ceil((timer.endsAt - nowMs) / 1000));
  }, [nowMs, timer.endsAt, timer.remainingSeconds, timer.running]);

  const honkCooldownSeconds =
    timer.honkAvailableAt && timer.honkAvailableAt > nowMs
      ? Math.ceil((timer.honkAvailableAt - nowMs) / 1000)
      : 0;

  useLayoutEffect(() => {
    setNowMs(Date.now());
  }, [timer.endsAt, timer.honkAvailableAt, timer.running]);

  useEffect(() => {
    if (!timer.running && honkCooldownSeconds === 0) {
      return;
    }

    const interval = window.setInterval(() => {
      setNowMs(Date.now());
    }, 250);

    return () => window.clearInterval(interval);
  }, [honkCooldownSeconds, timer.running]);

  return { remainingSeconds, honkCooldownSeconds };
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
  variant = "panel",
  headingLevel = "h2",
  className,
  showSectionLabel = true,
  showStatusChip = true,
  roundActions = null,
}: Props) {
  const { t } = useTranslation();
  const moderator = isMeModerator(state);
  const HeadingTag = headingLevel;
  const [soundEnabled, setSoundEnabled] = useState(getStoredTimerSoundEnabled);
  const headingId = useId();
  const hasMounted = useRef(false);
  const previousCompletedAt = useRef<number | null>(state.timer.completedAt);
  const previousHonkAt = useRef<number | null>(state.timer.lastHonkAt);
  const previousRemainingSeconds = useRef<number>(state.timer.remainingSeconds);
  const previousRunning = useRef<boolean>(state.timer.running);
  const localHonkPlayedAt = useRef<number | null>(null);
  const { remainingSeconds, honkCooldownSeconds } = useRoomTimerCountdown(state.timer);
  const timerStatus = getRoomTimerStatus(state.timer, remainingSeconds);
  const timerStateLabel =
    timerStatus === "running"
      ? t("room.timerState.running")
      : timerStatus === "complete"
        ? t("room.timerState.complete")
        : timerStatus === "paused"
          ? t("room.timerState.paused")
          : t("room.timerState.ready");

  useEffect(() => {
    setStoredTimerSoundEnabled(soundEnabled);
  }, [soundEnabled]);

  useEffect(() => {
    if (!hasMounted.current) {
      hasMounted.current = true;
      previousCompletedAt.current = state.timer.completedAt;
      previousHonkAt.current = state.timer.lastHonkAt;
      previousRemainingSeconds.current = remainingSeconds;
      previousRunning.current = state.timer.running;
      return;
    }

    if (!soundEnabled) {
      previousCompletedAt.current = state.timer.completedAt;
      previousHonkAt.current = state.timer.lastHonkAt;
      previousRemainingSeconds.current = remainingSeconds;
      previousRunning.current = state.timer.running;
      return;
    }

    if (state.timer.running && !previousRunning.current) {
      void playTimerStart();
    }

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
    } else if (state.timer.lastHonkAt !== null && state.timer.lastHonkAt !== previousHonkAt.current) {
      if (localHonkPlayedAt.current !== null && Date.now() - localHonkPlayedAt.current < 1500) {
        localHonkPlayedAt.current = null;
      } else {
        void playTimerHonk();
      }
    }

    previousCompletedAt.current = state.timer.completedAt;
    previousHonkAt.current = state.timer.lastHonkAt;
    previousRemainingSeconds.current = remainingSeconds;
    previousRunning.current = state.timer.running;
  }, [remainingSeconds, soundEnabled, state.timer.completedAt, state.timer.lastHonkAt, state.timer.running]);

  const handleToggleSound = async () => {
    if (!soundEnabled) {
      await primeRoomAudio();
    }
    setSoundEnabled((value) => !value);
  };

  const prepareAudioAndRun = async <T,>(action: () => Promise<T> | T, forceAudio = false): Promise<T> => {
    if (soundEnabled || forceAudio) {
      await primeRoomAudio();
    }
    return action();
  };

  const handleHonk = async () => {
    const ok = await prepareAudioAndRun(onHonk, true);
    if (!ok) {
      return;
    }

    localHonkPlayedAt.current = Date.now();
    void playTimerHonk();
  };

  return (
    <section
      className={[
        variant === "panel" ? "app-panel" : "",
        "room-timer",
        variant === "embedded" ? "room-timer--embedded" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      aria-labelledby={headingId}
    >
      <div className="room-timer__summary">
        <div>
          {showSectionLabel && <div className="section-label">{t("room.timer")}</div>}
          <HeadingTag id={headingId} className="room-timer__value">
            {formatCountdown(remainingSeconds)}
          </HeadingTag>
        </div>
        {showStatusChip ? (
          <div
            className={["ui-chip", timerStatus === "complete" ? "ui-chip--success" : "ui-chip--neutral"].join(
              " "
            )}
          >
            {timerStateLabel}
          </div>
        ) : null}
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
                {formatTimerDuration(value)}
              </option>
            ))}
          </select>
        </label>

        <div className="room-timer__actions">
          <div className="room-timer__actions-primary">
            {moderator && (
              <div className="room-timer__action-group room-timer__action-group--moderator">
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
                    className="button button--secondary room-timer__toggle"
                    type="button"
                    onClick={() => void prepareAudioAndRun(onStart)}
                    disabled={disabled}
                  >
                    {t("room.timerStart")}
                  </button>
                )}

                <button
                  className="button button--ghost room-timer__secondary-action"
                  type="button"
                  onClick={() => void prepareAudioAndRun(onReset)}
                  disabled={disabled}
                >
                  {t("room.timerReset")}
                </button>

                <button
                  className="button button--ghost room-timer__secondary-action"
                  type="button"
                  onClick={() => void handleHonk()}
                  disabled={disabled || honkCooldownSeconds > 0}
                >
                  {honkCooldownSeconds > 0
                    ? `${t("room.timerHonk")} (${honkCooldownSeconds})`
                    : t("room.timerHonk")}
                </button>
              </div>
            )}

            {roundActions ? (
              <div className="room-timer__action-group room-timer__action-group--round">{roundActions}</div>
            ) : null}
          </div>

          <div className="room-timer__action-group room-timer__action-group--local">
            <button
              className={[
                "button",
                soundEnabled ? "button--secondary" : "button--ghost",
                "room-timer__sound-toggle",
              ].join(" ")}
              type="button"
              onClick={() => void handleToggleSound()}
            >
              {soundEnabled ? t("room.timerSoundOn") : t("room.timerSoundOff")}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
