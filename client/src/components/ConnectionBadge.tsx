import type { ConnectionStatus } from "../hooks/useSocket";

const STATUS_COLORS: Record<ConnectionStatus, string> = {
  connected: "var(--color-success)",
  connecting: "var(--color-warning)",
  disconnected: "var(--color-danger)",
};

const STATUS_LABELS: Record<ConnectionStatus, string> = {
  connected: "Connected",
  connecting: "Connecting...",
  disconnected: "Disconnected",
};

export function ConnectionBadge({ status }: { status: ConnectionStatus }) {
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 10px",
        borderRadius: 20,
        background: "var(--color-surface)",
        fontSize: 12,
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: STATUS_COLORS[status],
          display: "inline-block",
        }}
      />
      {STATUS_LABELS[status]}
    </div>
  );
}
