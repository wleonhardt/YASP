import type { ConnectionStatus } from "../hooks/useSocket";

const STATUS_LABELS: Record<ConnectionStatus, string> = {
  connected: "Connected",
  connecting: "Reconnecting…",
  disconnected: "Disconnected",
};

export function ConnectionBadge({ status }: { status: ConnectionStatus }) {
  return (
    <div className={`connection-badge connection-badge--${status}`}>
      <span className="connection-badge__dot" />
      {STATUS_LABELS[status]}
    </div>
  );
}
