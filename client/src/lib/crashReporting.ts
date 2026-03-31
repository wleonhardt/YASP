const CLIENT_CRASH_ENDPOINT = "/api/client-error";
const DEDUP_WINDOW_MS = 5_000;
const MAX_FIELD_LENGTH = 4_000;
const MAX_STACK_LENGTH = 12_000;
const INSTALL_FLAG = "__yaspCrashReporterInstalled";

type ClientCrashReport = {
  type: "error" | "unhandledrejection";
  timestamp: string;
  message: string;
  name?: string | null;
  stack?: string | null;
  reason?: string | null;
  source?: string | null;
  line?: number | null;
  column?: number | null;
  href: string;
  path: string;
  userAgent?: string | null;
};

type BrowserWindowWithCrashFlag = Window & {
  [INSTALL_FLAG]?: boolean;
};

const recentCrashReports = new Map<string, number>();

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}

function toOptionalString(value: unknown, maxLength = MAX_FIELD_LENGTH): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }

  return truncate(trimmed, maxLength);
}

function toOptionalNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function summarizeReason(reason: unknown): {
  message: string;
  name: string | null;
  stack: string | null;
  reason: string | null;
} {
  if (reason instanceof Error) {
    return {
      message: truncate(reason.message || reason.name || "Unhandled promise rejection", MAX_FIELD_LENGTH),
      name: toOptionalString(reason.name),
      stack: toOptionalString(reason.stack, MAX_STACK_LENGTH),
      reason: null,
    };
  }

  if (typeof reason === "string") {
    return {
      message: truncate(reason, MAX_FIELD_LENGTH),
      name: null,
      stack: null,
      reason: null,
    };
  }

  if (typeof reason === "number" || typeof reason === "boolean" || reason === null || reason === undefined) {
    return {
      message: truncate(String(reason ?? "Unhandled promise rejection"), MAX_FIELD_LENGTH),
      name: null,
      stack: null,
      reason: null,
    };
  }

  try {
    const serialized = JSON.stringify(reason);
    return {
      message: "Unhandled promise rejection",
      name: null,
      stack: null,
      reason: serialized ? truncate(serialized, MAX_FIELD_LENGTH) : null,
    };
  } catch {
    return {
      message: "Unhandled promise rejection",
      name: null,
      stack: null,
      reason: Object.prototype.toString.call(reason),
    };
  }
}

function getBaseReport(): Pick<ClientCrashReport, "timestamp" | "href" | "path" | "userAgent"> {
  return {
    timestamp: new Date().toISOString(),
    href: window.location.href,
    path: `${window.location.pathname}${window.location.search}${window.location.hash}`,
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : null,
  };
}

function shouldReportCrash(report: ClientCrashReport): boolean {
  const now = Date.now();
  const signature = [
    report.type,
    report.message,
    report.name ?? "",
    report.source ?? "",
    report.line ?? "",
    report.column ?? "",
    report.path,
  ].join("|");

  for (const [key, at] of recentCrashReports) {
    if (now - at > DEDUP_WINDOW_MS) {
      recentCrashReports.delete(key);
    }
  }

  const previousAt = recentCrashReports.get(signature);
  if (previousAt !== undefined && now - previousAt < DEDUP_WINDOW_MS) {
    return false;
  }

  recentCrashReports.set(signature, now);
  return true;
}

function sendClientCrashReport(report: ClientCrashReport, endpoint: string): void {
  if (!shouldReportCrash(report)) {
    return;
  }

  const body = JSON.stringify(report);

  try {
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      const sent = navigator.sendBeacon(endpoint, new Blob([body], { type: "application/json" }));
      if (sent) {
        return;
      }
    }
  } catch {
    // Fall through to keepalive fetch.
  }

  if (typeof fetch === "function") {
    void fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body,
      keepalive: true,
      credentials: "same-origin",
    }).catch(() => {
      // Crash reporting must stay silent when the network path is unavailable.
    });
  }
}

function buildWindowErrorReport(event: ErrorEvent): ClientCrashReport {
  const runtimeError = event.error instanceof Error ? event.error : null;

  return {
    type: "error",
    ...getBaseReport(),
    message:
      toOptionalString(event.message) ?? toOptionalString(runtimeError?.message) ?? "Unhandled browser error",
    name: toOptionalString(runtimeError?.name),
    stack: toOptionalString(runtimeError?.stack, MAX_STACK_LENGTH),
    reason: null,
    source: toOptionalString(event.filename),
    line: toOptionalNumber(event.lineno),
    column: toOptionalNumber(event.colno),
  };
}

function buildUnhandledRejectionReport(event: PromiseRejectionEvent): ClientCrashReport {
  const details = summarizeReason(event.reason);

  return {
    type: "unhandledrejection",
    ...getBaseReport(),
    message: details.message,
    name: details.name,
    stack: details.stack,
    reason: details.reason,
    source: null,
    line: null,
    column: null,
  };
}

export function installGlobalCrashReporter(endpoint = CLIENT_CRASH_ENDPOINT): () => void {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const browserWindow = window as BrowserWindowWithCrashFlag;
  if (browserWindow[INSTALL_FLAG]) {
    return () => undefined;
  }

  browserWindow[INSTALL_FLAG] = true;

  const handleWindowError = (event: ErrorEvent) => {
    sendClientCrashReport(buildWindowErrorReport(event), endpoint);
  };

  const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
    sendClientCrashReport(buildUnhandledRejectionReport(event), endpoint);
  };

  window.addEventListener("error", handleWindowError);
  window.addEventListener("unhandledrejection", handleUnhandledRejection);

  return () => {
    window.removeEventListener("error", handleWindowError);
    window.removeEventListener("unhandledrejection", handleUnhandledRejection);
    recentCrashReports.clear();
    delete browserWindow[INSTALL_FLAG];
  };
}
