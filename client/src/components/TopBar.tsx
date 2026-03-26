import type { PublicRoomState } from "@yasp/shared";
import type { ConnectionStatus } from "../hooks/useSocket";
import { ConnectionBadge } from "./ConnectionBadge";
import { RoomStatus } from "./RoomStatus";

type Props = {
  state: PublicRoomState;
  connectionStatus: ConnectionStatus;
  onLeave: () => void;
  onCopyFeedback: (intent: "success" | "error", message: string) => void;
  disabled?: boolean;
};

export function TopBar({
  state,
  connectionStatus,
  onLeave,
  onCopyFeedback,
  disabled = false,
}: Props) {
  const roomUrl = `${window.location.origin}/r/${state.id}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(roomUrl);
      onCopyFeedback("success", "Room link copied");
    } catch {
      onCopyFeedback("error", "Couldn’t copy the room link");
    }
  };

  return (
    <header className="topbar app-panel">
      <div className="topbar__room">
        <div className="topbar__label">Room</div>
        <div className="topbar__room-row">
          <code className="topbar__room-code">{state.id}</code>
          <button className="button button--ghost" onClick={handleCopy}>
            Copy link
          </button>
        </div>
      </div>

      <RoomStatus state={state} />

      <div className="topbar__actions">
        <ConnectionBadge status={connectionStatus} />
        <button
          className="button button--ghost"
          onClick={onLeave}
          disabled={disabled}
        >
          Leave
        </button>
      </div>
    </header>
  );
}
