import { useTranslation } from "react-i18next";
import type { PublicRoomState } from "@yasp/shared";
import { formatCountdown, formatTimerDuration, getRoomTimerStatus, useRoomTimerCountdown } from "./RoomTimer";

type Props = {
  state: PublicRoomState;
  serverClockOffsetMs?: number;
};

export function TimerStrip({ state, serverClockOffsetMs = 0 }: Props) {
  const { t } = useTranslation();
  const { remainingSeconds } = useRoomTimerCountdown(state.timer, serverClockOffsetMs);
  const timerStatus = getRoomTimerStatus(state.timer, remainingSeconds);
  const statusLabel = t(`room.timerState.${timerStatus}`);

  return (
    <section className="timer-strip" aria-label={t("room.timer")}>
      <div className="timer-strip__copy">
        <div className="section-label">{t("room.timer")}</div>
        <p>
          {t("room.timerDuration")} {formatTimerDuration(state.timer.durationSeconds)}
        </p>
      </div>
      <div className="timer-strip__status">
        <strong className="timer-strip__value">{formatCountdown(remainingSeconds)}</strong>
        <span
          className={["ui-chip", timerStatus === "complete" ? "ui-chip--success" : "ui-chip--neutral"].join(
            " "
          )}
          aria-live="polite"
        >
          {statusLabel}
        </span>
      </div>
    </section>
  );
}
