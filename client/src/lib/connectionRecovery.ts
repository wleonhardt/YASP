export type ConnectionStatus = "connecting" | "connected" | "reconnecting" | "offline" | "failed";

export type ConnectionTransport = "websocket" | "polling" | "unknown";

export type HealthProbeStatus = "unknown" | "reachable" | "unreachable";

export type ConnectionProblem =
  | "none"
  | "offline"
  | "realtime_blocked"
  | "transport_failed"
  | "backend_unreachable"
  | "unknown";

export type ConnectionDiagnostics = {
  status: ConnectionStatus;
  compatibilityMode: boolean;
  transport: ConnectionTransport;
  online: boolean;
  retryCount: number;
  lastError: string | null;
  lastConnectedAt: number | null;
  healthStatus: HealthProbeStatus;
  problem: ConnectionProblem;
  endpoint: string;
  origin: string | null;
};

const TRANSPORT_BLOCKED_PATTERNS = [
  /xhr poll error/i,
  /websocket error/i,
  /transport error/i,
  /transport close/i,
  /websocket/i,
  /poll(?:ing)?/i,
  /network error/i,
  /blocked/i,
];

export function sanitizeConnectionError(error: unknown): string | null {
  const value =
    error instanceof Error ? error.message : typeof error === "string" ? error : error ? String(error) : null;

  if (!value) {
    return null;
  }

  const sanitized = value
    .replace(/https?:\/\/\S+/gi, "[url]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);

  return sanitized.length > 0 ? sanitized : null;
}

export function normalizeTransportName(value: string | null | undefined): ConnectionTransport {
  if (value === "websocket" || value === "polling") {
    return value;
  }

  return "unknown";
}

export function classifyConnectionProblem(snapshot: {
  status: ConnectionStatus;
  compatibilityMode: boolean;
  online: boolean;
  retryCount: number;
  lastError: string | null;
  healthStatus: HealthProbeStatus;
}): ConnectionProblem {
  if (!snapshot.online || snapshot.status === "offline") {
    return "offline";
  }

  if (snapshot.status !== "failed") {
    return "none";
  }

  if (snapshot.healthStatus === "unreachable") {
    return "backend_unreachable";
  }

  const lastError = snapshot.lastError ?? "";
  if (TRANSPORT_BLOCKED_PATTERNS.some((pattern) => pattern.test(lastError))) {
    return snapshot.compatibilityMode ? "transport_failed" : "realtime_blocked";
  }

  if (snapshot.healthStatus === "reachable" && snapshot.retryCount > 0) {
    return snapshot.compatibilityMode ? "transport_failed" : "realtime_blocked";
  }

  return "unknown";
}

export function formatConnectionTime(timestamp: number | null, locale: string): string | null {
  if (timestamp === null) {
    return null;
  }

  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) {
    return null;
  }

  try {
    return new Intl.DateTimeFormat(locale, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
  } catch {
    return date.toLocaleString();
  }
}
