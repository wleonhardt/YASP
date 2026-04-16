import { useEffect, useId, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ConnectionStatus, ConnectionTransport, HealthProbeStatus } from "../lib/connectionRecovery";
import { formatConnectionTime } from "../lib/connectionRecovery";
import { writeTextToClipboard } from "../lib/roundReport";
import type { SocketConnectionState } from "../hooks/useSocket";
import { ConnectionBadge, getConnectionLabels } from "./ConnectionBadge";

type Props = {
  connection: Pick<
    SocketConnectionState,
    "status" | "compatibilityMode" | "diagnostics" | "retry" | "enableCompatibilityMode"
  >;
  className?: string;
};

function getTransportLabel(
  transport: ConnectionTransport,
  t: ReturnType<typeof useTranslation>["t"]
): string {
  return t(`connection.transport.${transport}`);
}

function getHealthStatusLabel(
  healthStatus: HealthProbeStatus,
  t: ReturnType<typeof useTranslation>["t"]
): string {
  return t(`connection.health.${healthStatus}`);
}

function getHintKey(
  status: ConnectionStatus,
  problem: Props["connection"]["diagnostics"]["problem"]
): string {
  if (status === "offline") {
    return "connection.notice.offlineHint";
  }

  if (problem === "backend_unreachable") {
    return "connection.notice.backendUnreachableHint";
  }

  if (problem === "transport_failed") {
    return "connection.notice.transportFailedHint";
  }

  if (problem === "realtime_blocked") {
    return "connection.notice.realtimeBlockedHint";
  }

  if (status === "connecting") {
    return "connection.notice.connectingHint";
  }

  if (status === "reconnecting") {
    return "connection.notice.reconnectingHint";
  }

  return "connection.notice.failedHint";
}

function getTitleKey(status: ConnectionStatus): string {
  switch (status) {
    case "connecting":
      return "connection.notice.connectingTitle";
    case "reconnecting":
      return "connection.notice.reconnectingTitle";
    case "offline":
      return "connection.notice.offlineTitle";
    case "failed":
      return "connection.notice.failedTitle";
    default:
      return "connection.notice.failedTitle";
  }
}

export function ConnectionStatusNotice({ connection, className }: Props) {
  const { t, i18n } = useTranslation();
  const [detailsOpen, setDetailsOpen] = useState(connection.status === "failed");
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const detailsId = useId();
  const titleId = useId();
  const labels = getConnectionLabels(t, connection.status);
  const diagnostics = connection.diagnostics;
  const showOrigin = diagnostics.origin !== null && diagnostics.origin !== diagnostics.endpoint;

  useEffect(() => {
    if (connection.status === "failed") {
      setDetailsOpen(true);
      return;
    }

    if (connection.status === "connected") {
      setDetailsOpen(false);
    }
  }, [connection.status]);

  useEffect(() => {
    if (copyState === "idle") {
      return;
    }

    const timeoutId = window.setTimeout(() => setCopyState("idle"), 2_000);
    return () => window.clearTimeout(timeoutId);
  }, [copyState]);

  const diagnosticsText = useMemo(() => {
    const lastConnected =
      formatConnectionTime(diagnostics.lastConnectedAt, i18n.language) ?? t("connection.never");
    const rows = [
      `${t("connection.diagnostics.status")}: ${labels.full}`,
      `${t("connection.diagnostics.transport")}: ${getTransportLabel(diagnostics.transport, t)}`,
      `${t("connection.diagnostics.network")}: ${
        diagnostics.online ? t("connection.online") : t("connection.browserOffline")
      }`,
      `${t("connection.diagnostics.retryCount")}: ${diagnostics.retryCount}`,
      `${t("connection.diagnostics.compatibilityMode")}: ${
        diagnostics.compatibilityMode ? t("connection.enabled") : t("connection.disabled")
      }`,
      `${t("connection.diagnostics.lastError")}: ${diagnostics.lastError ?? t("connection.none")}`,
      `${t("connection.diagnostics.lastConnected")}: ${lastConnected}`,
      `${t("connection.diagnostics.healthProbe")}: ${getHealthStatusLabel(diagnostics.healthStatus, t)}`,
      `${t("connection.diagnostics.realtimeEndpoint")}: ${diagnostics.endpoint}`,
    ];

    if (showOrigin) {
      rows.push(`${t("connection.diagnostics.browserOrigin")}: ${diagnostics.origin}`);
    }

    return rows.join("\n");
  }, [diagnostics, i18n.language, labels.full, showOrigin, t]);

  if (connection.status === "connected") {
    return null;
  }

  const showCompatibilityAction =
    !connection.compatibilityMode && (connection.status === "failed" || connection.status === "reconnecting");
  const lastConnected =
    formatConnectionTime(diagnostics.lastConnectedAt, i18n.language) ?? t("connection.never");
  const copyLabel =
    copyState === "copied"
      ? t("connection.copyDiagnosticsCopied")
      : copyState === "failed"
        ? t("connection.copyDiagnosticsFailed")
        : t("connection.copyDiagnostics");

  const handleCopyDiagnostics = async () => {
    try {
      await writeTextToClipboard(diagnosticsText);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  };

  return (
    <section className={["connection-notice", className].filter(Boolean).join(" ")} aria-labelledby={titleId}>
      <div className="connection-notice__summary">
        <ConnectionBadge
          status={connection.status}
          labelMode="full"
          compatibilityMode={connection.compatibilityMode}
        />
        <div className="connection-notice__copy">
          <h2 id={titleId} className="connection-notice__title">
            {t(getTitleKey(connection.status))}
          </h2>
          <p className="connection-notice__hint">{t(getHintKey(connection.status, diagnostics.problem))}</p>
          {connection.compatibilityMode && (
            <p className="connection-notice__mode">{t("connection.compatibilityModeActive")}</p>
          )}
        </div>
      </div>

      <div className="connection-notice__actions">
        <button type="button" className="button button--primary" onClick={connection.retry}>
          {t("connection.retry")}
        </button>
        {showCompatibilityAction && (
          <button type="button" className="button button--ghost" onClick={connection.enableCompatibilityMode}>
            {t("connection.tryCompatibilityMode")}
          </button>
        )}
        <button
          type="button"
          className="button button--ghost"
          aria-expanded={detailsOpen}
          aria-controls={detailsId}
          onClick={() => setDetailsOpen((current) => !current)}
        >
          {t("connection.connectionDetails")}
        </button>
      </div>

      {detailsOpen && (
        <div id={detailsId} className="connection-notice__details">
          <div className="connection-notice__details-header">
            <h3 className="connection-notice__details-title">{t("connection.diagnostics.title")}</h3>
            <button type="button" className="button button--ghost" onClick={handleCopyDiagnostics}>
              {copyLabel}
            </button>
          </div>

          <dl className="connection-notice__grid">
            <div>
              <dt>{t("connection.diagnostics.status")}</dt>
              <dd>{labels.full}</dd>
            </div>
            <div>
              <dt>{t("connection.diagnostics.transport")}</dt>
              <dd>{getTransportLabel(diagnostics.transport, t)}</dd>
            </div>
            <div>
              <dt>{t("connection.diagnostics.network")}</dt>
              <dd>{diagnostics.online ? t("connection.online") : t("connection.browserOffline")}</dd>
            </div>
            <div>
              <dt>{t("connection.diagnostics.retryCount")}</dt>
              <dd>{diagnostics.retryCount}</dd>
            </div>
            <div>
              <dt>{t("connection.diagnostics.compatibilityMode")}</dt>
              <dd>{diagnostics.compatibilityMode ? t("connection.enabled") : t("connection.disabled")}</dd>
            </div>
            <div>
              <dt>{t("connection.diagnostics.healthProbe")}</dt>
              <dd>{getHealthStatusLabel(diagnostics.healthStatus, t)}</dd>
            </div>
            <div>
              <dt>{t("connection.diagnostics.lastConnected")}</dt>
              <dd>{lastConnected}</dd>
            </div>
            <div className="connection-notice__grid-item--wide">
              <dt>{t("connection.diagnostics.lastError")}</dt>
              <dd>{diagnostics.lastError ?? t("connection.none")}</dd>
            </div>
            <div className="connection-notice__grid-item--wide">
              <dt>{t("connection.diagnostics.realtimeEndpoint")}</dt>
              <dd>{diagnostics.endpoint}</dd>
            </div>
            {showOrigin && (
              <div className="connection-notice__grid-item--wide">
                <dt>{t("connection.diagnostics.browserOrigin")}</dt>
                <dd>{diagnostics.origin}</dd>
              </div>
            )}
          </dl>
        </div>
      )}
    </section>
  );
}
