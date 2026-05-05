import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import { ROOM_TIMER_MIN_SECONDS, ROOM_TIMER_MAX_SECONDS, type PublicRoomState } from "@yasp/shared";
import {
  isRoomAudioPrimed,
  playTimerComplete,
  playTimerHonk,
  playTimerStart,
  playTimerTick,
  primeRoomAudio,
} from "../lib/audio";
import { isMeModerator } from "../lib/room";
import { getStoredTimerSoundEnabled, setStoredTimerSoundEnabled } from "../lib/storage";

export type RoomTimerStatus = "running" | "complete" | "paused" | "ready";

const COUNTDOWN_DISPLAY_BIAS_MS = 120;

type Props = {
  state: PublicRoomState;
  onSetDuration: (durationSeconds: number) => Promise<unknown> | unknown;
  onStart: () => Promise<boolean> | boolean;
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
  compactActions?: boolean;
  serverClockOffsetMs?: number;
};

type PreviousTimerSnapshotRefs = {
  completedAt: MutableRefObject<number | null>;
  honkAt: MutableRefObject<number | null>;
  remainingSeconds: MutableRefObject<number>;
  running: MutableRefObject<boolean>;
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

export function getDisplayRemainingSeconds(
  timer: PublicRoomState["timer"],
  nowMs: number,
  serverClockOffsetMs = 0,
  displayBiasMs = COUNTDOWN_DISPLAY_BIAS_MS
): number {
  if (!timer.running || timer.endsAt === null) {
    return timer.remainingSeconds;
  }

  const adjustedNowMs = nowMs + serverClockOffsetMs;
  const remainingMs = timer.endsAt - adjustedNowMs;

  if (remainingMs <= 0) {
    return 0;
  }

  const biasedSeconds = Math.ceil((remainingMs - displayBiasMs) / 1000);
  return Math.max(1, Math.min(timer.remainingSeconds, biasedSeconds));
}

export function getCooldownSeconds(
  targetAtMs: number | null,
  nowMs: number,
  serverClockOffsetMs = 0
): number {
  if (!targetAtMs) {
    return 0;
  }

  const adjustedNowMs = nowMs + serverClockOffsetMs;
  return targetAtMs > adjustedNowMs ? Math.ceil((targetAtMs - adjustedNowMs) / 1000) : 0;
}

function syncPreviousTimerSnapshot(
  refs: PreviousTimerSnapshotRefs,
  timer: Pick<PublicRoomState["timer"], "completedAt" | "lastHonkAt" | "running">,
  remainingSeconds: number
): void {
  refs.completedAt.current = timer.completedAt;
  refs.honkAt.current = timer.lastHonkAt;
  refs.remainingSeconds.current = remainingSeconds;
  refs.running.current = timer.running;
}

export function useRoomTimerCountdown(
  timer: PublicRoomState["timer"],
  serverClockOffsetMs = 0
): {
  remainingSeconds: number;
  honkCooldownSeconds: number;
} {
  const [nowMs, setNowMs] = useState(() => Date.now());

  const remainingSeconds = useMemo(() => {
    return getDisplayRemainingSeconds(timer, nowMs, serverClockOffsetMs);
  }, [nowMs, serverClockOffsetMs, timer]);

  const honkCooldownSeconds = useMemo(
    () => getCooldownSeconds(timer.honkAvailableAt, nowMs, serverClockOffsetMs),
    [nowMs, serverClockOffsetMs, timer.honkAvailableAt]
  );

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

const TIMER_MIN = ROOM_TIMER_MIN_SECONDS;
const TIMER_MAX = ROOM_TIMER_MAX_SECONDS;

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M8 6.5v11l8.5-5.5L8 6.5Z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M7 5h4v14H7zM13 5h4v14h-4z" />
    </svg>
  );
}

function ResetIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M20 12a8 8 0 1 1-2.34-5.66" />
      <path d="M20 4v6h-6" />
    </svg>
  );
}

function BeepIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M12 6a4 4 0 0 1 4 4v3.5l1.5 2.5h-11L8 13.5V10a4 4 0 0 1 4-4Z" />
      <path d="M10 18a2 2 0 0 0 4 0" />
      <path d="M18 8.5a6.5 6.5 0 0 1 0 7" />
      <path d="M6 15.5a6.5 6.5 0 0 1 0-7" />
    </svg>
  );
}

function SoundOnIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M11 5 6 9H3v6h3l5 4z" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7" />
      <path d="M18 6a8.5 8.5 0 0 1 0 12" />
    </svg>
  );
}

function SoundOffIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M11 5 6 9H3v6h3l5 4z" />
      <path d="m16 9 5 5" />
      <path d="m21 9-5 5" />
    </svg>
  );
}

type TimerActionContentProps = {
  label: string;
  icon: ReactNode;
  badge?: ReactNode;
};

function TimerActionContent({ label, icon, badge = null }: TimerActionContentProps) {
  return (
    <>
      <span className="room-timer__button-icon">{icon}</span>
      <span className="room-timer__button-label">{label}</span>
      {badge ? <span className="room-timer__button-badge">{badge}</span> : null}
    </>
  );
}

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
  compactActions = false,
  serverClockOffsetMs = 0,
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
  const localStartPlayedAt = useRef<number | null>(null);
  const localHonkPlayedAt = useRef<number | null>(null);
  const audioReadyRef = useRef<boolean>(isRoomAudioPrimed());
  const { remainingSeconds, honkCooldownSeconds } = useRoomTimerCountdown(state.timer, serverClockOffsetMs);
  const timerStatus = getRoomTimerStatus(state.timer, remainingSeconds);
  const timerStateLabel =
    timerStatus === "running"
      ? t("room.timerState.running")
      : timerStatus === "complete"
        ? t("room.timerState.complete")
        : timerStatus === "paused"
          ? t("room.timerState.paused")
          : t("room.timerState.ready");
  const pauseLabel = t("room.timerPause");
  const startLabel = t("room.timerStart");
  const resetLabel = t("room.timerReset");
  const honkLabel = t("room.timerHonk");
  const soundLabel = soundEnabled ? t("room.timerSoundOn") : t("room.timerSoundOff");
  const honkAccessibleLabel = honkCooldownSeconds > 0 ? `${honkLabel} (${honkCooldownSeconds})` : honkLabel;

  useEffect(() => {
    if (!soundEnabled) {
      audioReadyRef.current = false;
    }
    setStoredTimerSoundEnabled(soundEnabled);
  }, [soundEnabled]);

  useEffect(() => {
    if (!hasMounted.current) {
      hasMounted.current = true;
      syncPreviousTimerSnapshot(
        {
          completedAt: previousCompletedAt,
          honkAt: previousHonkAt,
          remainingSeconds: previousRemainingSeconds,
          running: previousRunning,
        },
        {
          completedAt: state.timer.completedAt,
          lastHonkAt: state.timer.lastHonkAt,
          running: state.timer.running,
        },
        remainingSeconds
      );
      return;
    }

    if (!soundEnabled || !audioReadyRef.current) {
      syncPreviousTimerSnapshot(
        {
          completedAt: previousCompletedAt,
          honkAt: previousHonkAt,
          remainingSeconds: previousRemainingSeconds,
          running: previousRunning,
        },
        {
          completedAt: state.timer.completedAt,
          lastHonkAt: state.timer.lastHonkAt,
          running: state.timer.running,
        },
        remainingSeconds
      );
      return;
    }

    if (state.timer.running && !previousRunning.current) {
      if (localStartPlayedAt.current !== null && Date.now() - localStartPlayedAt.current < 1500) {
        localStartPlayedAt.current = null;
      } else {
        void playTimerStart();
      }
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

    syncPreviousTimerSnapshot(
      {
        completedAt: previousCompletedAt,
        honkAt: previousHonkAt,
        remainingSeconds: previousRemainingSeconds,
        running: previousRunning,
      },
      {
        completedAt: state.timer.completedAt,
        lastHonkAt: state.timer.lastHonkAt,
        running: state.timer.running,
      },
      remainingSeconds
    );
  }, [remainingSeconds, soundEnabled, state.timer.completedAt, state.timer.lastHonkAt, state.timer.running]);

  const handleToggleSound = async () => {
    if (!soundEnabled) {
      audioReadyRef.current = await primeRoomAudio();
      setSoundEnabled(true);
      return;
    }

    audioReadyRef.current = false;
    setSoundEnabled(false);
  };

  const prepareAudioAndRun = async <T,>(action: () => Promise<T> | T): Promise<T> => {
    if (soundEnabled) {
      audioReadyRef.current = await primeRoomAudio();
    }
    return action();
  };

  const handleHonk = async () => {
    const audioReady = await primeRoomAudio();
    audioReadyRef.current = audioReady;
    const ok = await onHonk();
    if (!ok) {
      return;
    }

    localHonkPlayedAt.current = Date.now();
    if (audioReady) {
      void playTimerHonk();
    }
  };

  const handleStart = async () => {
    const audioReady = soundEnabled ? await primeRoomAudio() : false;
    if (soundEnabled) {
      audioReadyRef.current = audioReady;
    }

    const ok = await onStart();
    if (!ok || !soundEnabled || !audioReady) {
      return;
    }

    localStartPlayedAt.current = Date.now();
    void playTimerStart();
  };

  const summaryContent = (
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
          aria-live="polite"
        >
          {timerStateLabel}
        </div>
      ) : null}
    </div>
  );

  const durationMinutes = Math.floor(state.timer.durationSeconds / 60);
  const durationSecondsRemainder = state.timer.durationSeconds % 60;
  const durationDisabled = disabled || !moderator || state.timer.running;

  const commitDuration = (minutes: number, seconds: number) => {
    const total = Math.max(TIMER_MIN, Math.min(TIMER_MAX, minutes * 60 + seconds));
    void prepareAudioAndRun(() => onSetDuration(total));
  };

  const durationField = (
    <fieldset className="room-timer__duration-fieldset" disabled={durationDisabled}>
      <legend className="field__label">{t("room.timerDuration")}</legend>
      <div className="room-timer__duration-inputs">
        <label className="room-timer__duration-field">
          <input
            className="input room-timer__duration-input"
            type="number"
            min={0}
            max={Math.floor(TIMER_MAX / 60)}
            step={1}
            value={durationMinutes}
            inputMode="numeric"
            autoComplete="off"
            pattern="[0-9]*"
            onChange={(e) => {
              const m = Math.max(0, Math.min(Math.floor(TIMER_MAX / 60), Number(e.target.value) | 0));
              commitDuration(m, durationSecondsRemainder);
            }}
            onWheel={(event) => event.currentTarget.blur()}
            aria-label={t("room.timerMinutes")}
          />
          <span className="room-timer__duration-unit" aria-hidden="true">
            m
          </span>
        </label>
        <label className="room-timer__duration-field">
          <input
            className="input room-timer__duration-input"
            type="number"
            min={0}
            max={59}
            step={5}
            value={durationSecondsRemainder}
            inputMode="numeric"
            autoComplete="off"
            pattern="[0-9]*"
            onChange={(e) => {
              const s = Math.max(0, Math.min(59, Number(e.target.value) | 0));
              commitDuration(durationMinutes, s);
            }}
            onWheel={(event) => event.currentTarget.blur()}
            aria-label={t("room.timerSeconds")}
          />
          <span className="room-timer__duration-unit" aria-hidden="true">
            s
          </span>
        </label>
      </div>
    </fieldset>
  );

  const moderatorActionButtons = moderator ? (
    <>
      {state.timer.running ? (
        <button
          className="button button--secondary"
          type="button"
          onClick={() => void prepareAudioAndRun(onPause)}
          disabled={disabled}
          aria-label={pauseLabel}
        >
          <TimerActionContent label={pauseLabel} icon={<PauseIcon />} />
        </button>
      ) : (
        <button
          className="button button--primary room-timer__toggle"
          type="button"
          onClick={() => void handleStart()}
          disabled={disabled}
          aria-label={startLabel}
        >
          <TimerActionContent label={startLabel} icon={<PlayIcon />} />
        </button>
      )}

      <button
        className="button button--ghost room-timer__secondary-action"
        type="button"
        onClick={() => void prepareAudioAndRun(onReset)}
        disabled={disabled}
        aria-label={resetLabel}
      >
        <TimerActionContent label={resetLabel} icon={<ResetIcon />} />
      </button>

      <button
        className="button button--ghost room-timer__secondary-action"
        type="button"
        onClick={() => void handleHonk()}
        disabled={disabled || honkCooldownSeconds > 0}
        aria-label={honkAccessibleLabel}
      >
        <TimerActionContent
          label={honkAccessibleLabel}
          icon={<BeepIcon />}
          badge={honkCooldownSeconds > 0 ? honkCooldownSeconds : null}
        />
      </button>
    </>
  ) : null;

  const soundToggleButton = (
    <button
      className={[
        "button",
        soundEnabled ? "button--secondary" : "button--ghost",
        "room-timer__sound-toggle",
      ].join(" ")}
      type="button"
      onClick={() => void handleToggleSound()}
      aria-label={soundLabel}
      aria-pressed={soundEnabled}
      title={soundLabel}
    >
      <TimerActionContent label={soundLabel} icon={soundEnabled ? <SoundOnIcon /> : <SoundOffIcon />} />
    </button>
  );

  return (
    <section
      className={[
        variant === "panel" ? "app-panel" : "",
        "room-timer",
        variant === "embedded" ? "room-timer--embedded" : "",
        compactActions ? "room-timer--compact-actions" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      aria-labelledby={headingId}
    >
      {compactActions ? (
        <div className="timerPacingLayout">
          {summaryContent}
          {durationField}
          <div className="timerControlsGrid">
            {moderatorActionButtons}
            {soundToggleButton}
          </div>
          {roundActions ? <div className="room-timer__compact-round-actions">{roundActions}</div> : null}
        </div>
      ) : (
        <>
          {summaryContent}

          <div className="room-timer__controls">
            {durationField}

            <div className="room-timer__actions">
              <div className="room-timer__actions-primary">
                {moderator ? (
                  <div className="room-timer__action-group room-timer__action-group--moderator">
                    {moderatorActionButtons}
                  </div>
                ) : null}

                {roundActions ? (
                  <div className="room-timer__action-group room-timer__action-group--round">
                    {roundActions}
                  </div>
                ) : null}
              </div>

              <div className="room-timer__action-group room-timer__action-group--local">
                {soundToggleButton}
              </div>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
