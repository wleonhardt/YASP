import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import type { ConnectionStatus } from "../lib/connectionRecovery";

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
    reconnecting: {
      full: t("connection.reconnectingFull"),
      short: t("connection.reconnectingShort"),
    },
    offline: {
      full: t("connection.offlineFull"),
      short: t("connection.offlineShort"),
    },
    failed: {
      full: t("connection.failedFull"),
      short: t("connection.failedShort"),
    },
  };

  return labels[status];
}

type Props = {
  status: ConnectionStatus;
  labelMode?: "responsive" | "full" | "short";
  announce?: boolean;
  className?: string;
  compatibilityMode?: boolean;
};

export function ConnectionBadge({
  status,
  labelMode = "responsive",
  announce = true,
  className,
  compatibilityMode = false,
}: Props) {
  const { t } = useTranslation();
  const label = getConnectionLabels(t, status);

  return (
    <div
      className={[
        "connection-badge",
        `connection-badge--${status}`,
        compatibilityMode ? "connection-badge--compatibility" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
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
      {compatibilityMode && (
        <span className="connection-badge__mode" aria-label={t("connection.compatibilityModeActive")}>
          {t("connection.compatibilityShort")}
        </span>
      )}
    </div>
  );
}
