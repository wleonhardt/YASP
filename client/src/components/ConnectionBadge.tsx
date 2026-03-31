import type { TFunction } from "i18next";
import type { ConnectionStatus } from "../hooks/useSocket";
import { useTranslation } from "react-i18next";

export function getConnectionLabels(
  t: TFunction<"translation", undefined>,
  status: ConnectionStatus
): { full: string; short: string } {
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

  return labels[status];
}

type Props = {
  status: ConnectionStatus;
  labelMode?: "responsive" | "full" | "short";
  announce?: boolean;
  className?: string;
};

export function ConnectionBadge({ status, labelMode = "responsive", announce = true, className }: Props) {
  const { t } = useTranslation();
  const label = getConnectionLabels(t, status);

  return (
    <div
      className={["connection-badge", `connection-badge--${status}`, className].filter(Boolean).join(" ")}
      role={announce ? "status" : undefined}
      aria-live={announce ? "polite" : undefined}
      aria-atomic={announce ? "true" : undefined}
    >
      <span className="sr-only">{label.full}</span>
      <span className="connection-badge__dot" aria-hidden="true" />
      {labelMode !== "short" && (
        <span className="connection-badge__label connection-badge__label--full" aria-hidden="true">
          {label.full}
        </span>
      )}
      {labelMode !== "full" && (
        <span className="connection-badge__label connection-badge__label--short" aria-hidden="true">
          {label.short}
        </span>
      )}
    </div>
  );
}
