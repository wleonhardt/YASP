import type { ConnectionStatus } from "../hooks/useSocket";

const STATUS_LABELS: Record<
  ConnectionStatus,
  { full: string; short: string }
> = {
  connected: { full: "Connected", short: "Live" },
  connecting: { full: "Reconnecting…", short: "Syncing…" },
  disconnected: { full: "Disconnected", short: "Offline" },
};

export function ConnectionBadge({ status }: { status: ConnectionStatus }) {
  const label = STATUS_LABELS[status];

  return (
    <div
      className={`connection-badge connection-badge--${status}`}
      aria-label={label.full}
      title={label.full}
    >
      <span className="connection-badge__dot" />
      <span className="connection-badge__label connection-badge__label--full">
        {label.full}
      </span>
      <span className="connection-badge__label connection-badge__label--short">
        {label.short}
      </span>
    </div>
  );
}
