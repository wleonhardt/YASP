import type { PublicRoomState } from "@yasp/shared";
import { useTranslation } from "react-i18next";
import { getDeckLabel } from "../i18n/decks";
import type { ConnectionStatus } from "../lib/connectionRecovery";
import { RoomCodeShare } from "./RoomCodeShare";
import { RoomStatus } from "./RoomStatus";
import { RoomUtilityMenu } from "./RoomUtilityMenu";

type Props = {
  state: PublicRoomState;
  connectionStatus: ConnectionStatus;
  compatibilityMode: boolean;
  onLeave: () => void;
  onCopyFeedback: (intent: "success" | "error", message: string) => void;
  disabled?: boolean;
};

export function TopBar({
  state,
  connectionStatus,
  compatibilityMode,
  onLeave,
  onCopyFeedback,
  disabled = false,
}: Props) {
  const { t } = useTranslation();

  return (
    <header className="topbar app-panel">
      <RoomCodeShare roomId={state.id} onCopyError={onCopyFeedback} />

      <RoomStatus state={state} deckLabel={getDeckLabel(t, state.deck)} />

      <div className="topbar__actions">
        <button
          className="button button--ghost topbar__leave-button"
          onClick={onLeave}
          disabled={disabled}
          aria-label={t("room.leaveRoom")}
          title={t("room.leaveRoom")}
        >
          <span className="topbar__leave-label">{t("room.leave")}</span>
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
        <RoomUtilityMenu status={connectionStatus} compatibilityMode={compatibilityMode} />
      </div>
    </header>
  );
}
