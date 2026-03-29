import type { PublicRoomState } from "@yasp/shared";
import { useTranslation } from "react-i18next";
import { getConnectedVoterCounts, getRoomPhase } from "../lib/room";

type Props = {
  state: PublicRoomState;
  deckLabel: string;
};

export function RoomStatus({ state, deckLabel }: Props) {
  const { t } = useTranslation();
  const phase = getRoomPhase(state);
  const { percent, voted, total } = getConnectedVoterCounts(state);
  const phaseLabel =
    phase === "revealed"
      ? t("room.phase.revealed")
      : phase === "voting"
        ? t("room.phase.voting")
        : t("room.phase.waiting");
  const progressText = t("room.progress", { voted, total });

  return (
    <div className="room-status">
      <div className="room-status__eyebrow">{t("room.round", { count: state.roundNumber })}</div>
      <div className="room-status__headline">
        <strong>{t("room.round", { count: state.roundNumber })}</strong>
        <span className={`phase-chip phase-chip--${phase}`}>{phaseLabel}</span>
      </div>
      <div className="room-status__meta">
        <span>{progressText}</span>
        <span className="room-status__separator">•</span>
        <span>{deckLabel}</span>
      </div>
      <div className="room-status__progress">
        <div className="room-status__progress-fill" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
