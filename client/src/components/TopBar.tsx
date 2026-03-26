import type { PublicRoomState } from "@yasp/shared";
import type { ConnectionStatus } from "../hooks/useSocket";
import { ConnectionBadge } from "./ConnectionBadge";
import { RoomStatus } from "./RoomStatus";
import { ThemeToggle } from "./ThemeToggle";

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
          <code className="topbar__room-code topbar__room-code--desktop">{state.id}</code>
          <button
            className="button button--ghost topbar__copy-button topbar__copy-button--desktop"
            onClick={handleCopy}
            aria-label="Copy room link"
          >
            Copy link
          </button>
          <button
            className="button button--ghost topbar__room-link topbar__room-link--mobile"
            onClick={handleCopy}
            aria-label="Copy room link"
          >
            <code className="topbar__room-code">{state.id}</code>
            <span className="topbar__copy-label topbar__copy-label--full">Copy link</span>
            <span className="topbar__copy-label topbar__copy-label--short">Copy</span>
          </button>
        </div>
      </div>

      <RoomStatus state={state} />

      <div className="topbar__actions">
        <ThemeToggle />
        <ConnectionBadge status={connectionStatus} />
        <button
          className="button button--ghost topbar__leave-button"
          onClick={onLeave}
          disabled={disabled}
          aria-label="Leave room"
          title="Leave room"
        >
          <span className="topbar__leave-label">Leave</span>
          <svg
            className="topbar__leave-icon"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
        </button>
      </div>
    </header>
  );
}
