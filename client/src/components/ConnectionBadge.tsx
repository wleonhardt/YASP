import type { ConnectionStatus } from "../hooks/useSocket";
import { useTranslation } from "react-i18next";

export function ConnectionBadge({ status }: { status: ConnectionStatus }) {
  const { t } = useTranslation();
  const labels: Record<ConnectionStatus, { full: string; short: string }> = {
    connected: {
      full: t("connection.connectedFull"),
      short: t("connection.connectedShort"),
    },
    connecting: {
      full: t("connection.connectingFull"),
      short: t("connection.connectingShort"),
    },
    disconnected: {
      full: t("connection.disconnectedFull"),
      short: t("connection.disconnectedShort"),
    },
  };
  const label = labels[status];

  return (
    <div
      className={`connection-badge connection-badge--${status}`}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <span className="sr-only">{label.full}</span>
      <span className="connection-badge__dot" aria-hidden="true" />
      <span className="connection-badge__label connection-badge__label--full" aria-hidden="true">
        {label.full}
      </span>
      <span className="connection-badge__label connection-badge__label--short" aria-hidden="true">
        {label.short}
      </span>
    </div>
  );
}
