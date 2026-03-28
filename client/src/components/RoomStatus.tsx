import type { PublicRoomState } from "@yasp/shared";
import { getConnectedVoterCounts, getPhaseLabel, getRoomPhase, getProgressText } from "../lib/room";

type Props = {
  state: PublicRoomState;
};

export function RoomStatus({ state }: Props) {
  const phase = getRoomPhase(state);
  const progressText = getProgressText(state);
  const { percent } = getConnectedVoterCounts(state);

  return (
    <div className="room-status">
      <div className="room-status__eyebrow">Round {state.roundNumber}</div>
      <div className="room-status__headline">
        <strong>Round {state.roundNumber}</strong>
        <span className={`phase-chip phase-chip--${phase}`}>{getPhaseLabel(state)}</span>
      </div>
      <div className="room-status__meta">
        <span>{progressText}</span>
        <span className="room-status__separator">•</span>
        <span>{state.deck.label}</span>
      </div>
      <div className="room-status__progress">
        <div className="room-status__progress-fill" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
