import type { PublicRoomState } from "@yasp/shared";
import { useTranslation } from "react-i18next";
import type { ConnectionStatus } from "../hooks/useSocket";
import { getDeckLabel } from "../i18n/decks";
import { ConnectionBadge } from "./ConnectionBadge";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { RoomStatus } from "./RoomStatus";
import { ThemeToggle } from "./ThemeToggle";

type Props = {
  state: PublicRoomState;
  connectionStatus: ConnectionStatus;
  onLeave: () => void;
  onCopyFeedback: (intent: "success" | "error", message: string) => void;
  disabled?: boolean;
};

export function TopBar({ state, connectionStatus, onLeave, onCopyFeedback, disabled = false }: Props) {
  const { t } = useTranslation();
  const roomUrl = `${window.location.origin}/r/${state.id}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(roomUrl);
      onCopyFeedback("success", t("room.copySuccess"));
    } catch {
      onCopyFeedback("error", t("room.copyError"));
    }
  };

  return (
    <header className="topbar app-panel">
      <div className="topbar__room">
        <div className="topbar__label">{t("room.room")}</div>
        <div className="topbar__room-row">
          <code className="topbar__room-code topbar__room-code--desktop">{state.id}</code>
          <button
            className="button button--ghost topbar__copy-button topbar__copy-button--desktop"
            onClick={handleCopy}
            aria-label={t("room.copyLink")}
          >
            {t("room.copyLink")}
          </button>
          <button
            className="button button--ghost topbar__room-link topbar__room-link--mobile"
            onClick={handleCopy}
            aria-label={t("room.copyLink")}
          >
            <code className="topbar__room-code">{state.id}</code>
            <span className="topbar__copy-label topbar__copy-label--full">{t("room.copyLink")}</span>
            <span className="topbar__copy-label topbar__copy-label--short">{t("room.copyShort")}</span>
          </button>
        </div>
      </div>

      <RoomStatus state={state} deckLabel={getDeckLabel(t, state.deck)} />

      <div className="topbar__actions">
        <LanguageSwitcher compact />
        <ThemeToggle />
        <ConnectionBadge status={connectionStatus} />
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
      </div>
    </header>
  );
}
