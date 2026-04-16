import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ConnectionDiagnostics, ConnectionProblem, ConnectionStatus } from "../lib/connectionRecovery";
import { ConnectionStatusNotice } from "./ConnectionStatusNotice";

function buildDiagnostics(
  status: ConnectionStatus,
  overrides: Partial<ConnectionDiagnostics> = {}
): ConnectionDiagnostics {
  const compatibilityMode = overrides.compatibilityMode ?? false;
  const retryCount = overrides.retryCount ?? (status === "failed" ? 3 : 0);
  const lastError = overrides.lastError ?? (status === "failed" ? "xhr poll error" : null);
  const healthStatus = overrides.healthStatus ?? (status === "failed" ? "reachable" : "unknown");

  const problem: ConnectionProblem =
    overrides.problem ??
    (status === "offline"
      ? "offline"
      : status === "failed"
        ? compatibilityMode
          ? "transport_failed"
          : "realtime_blocked"
        : "none");

  return {
    status,
    compatibilityMode,
    transport: overrides.transport ?? (compatibilityMode ? "polling" : "websocket"),
    online: overrides.online ?? status !== "offline",
    retryCount,
    lastError,
    lastConnectedAt: overrides.lastConnectedAt ?? 1_710_000_000_000,
    healthStatus,
    problem,
    endpoint: overrides.endpoint ?? "http://localhost:3001",
    origin: overrides.origin ?? "http://localhost:5173",
  };
}

function buildConnection(status: ConnectionStatus, overrides: Partial<ConnectionDiagnostics> = {}) {
  return {
    status,
    compatibilityMode: overrides.compatibilityMode ?? false,
    diagnostics: buildDiagnostics(status, overrides),
    retry: vi.fn(),
    enableCompatibilityMode: vi.fn(),
  };
}

describe("ConnectionStatusNotice", () => {
  it("shows retry and compatibility actions in failed states and wires the handlers", async () => {
    const user = userEvent.setup();
    const connection = buildConnection("failed");

    render(<ConnectionStatusNotice connection={connection} />);

    await user.click(screen.getByRole("button", { name: "Retry" }));
    await user.click(screen.getByRole("button", { name: "Try compatibility mode" }));

    expect(connection.retry).toHaveBeenCalledTimes(1);
    expect(connection.enableCompatibilityMode).toHaveBeenCalledTimes(1);
  });

  it("renders diagnostics details for affected users", () => {
    const connection = buildConnection("failed", {
      transport: "polling",
      healthStatus: "reachable",
      lastError: "xhr poll error",
    });

    render(<ConnectionStatusNotice connection={connection} />);

    const details = screen.getByText("Diagnostics").closest(".connection-notice__details");
    if (!(details instanceof HTMLElement)) {
      throw new Error("Diagnostics panel not found");
    }

    const scope = within(details);
    expect(scope.getByText("HTTP polling")).toBeInTheDocument();
    expect(scope.getByText("Reachable")).toBeInTheDocument();
    expect(scope.getByText("http://localhost:3001")).toBeInTheDocument();
    expect(scope.getByText("http://localhost:5173")).toBeInTheDocument();
    expect(scope.getByText("xhr poll error")).toBeInTheDocument();
  });

  it("hides browser origin when it duplicates the realtime endpoint", () => {
    const connection = buildConnection("failed", {
      endpoint: "https://app.yasp.team",
      origin: "https://app.yasp.team",
    });

    render(<ConnectionStatusNotice connection={connection} />);

    const details = screen.getByText("Diagnostics").closest(".connection-notice__details");
    if (!(details instanceof HTMLElement)) {
      throw new Error("Diagnostics panel not found");
    }

    const scope = within(details);
    expect(scope.getByText("https://app.yasp.team")).toBeInTheDocument();
    expect(scope.queryByText("Browser origin")).not.toBeInTheDocument();
  });

  it("shows the offline recovery message without compatibility fallback noise", () => {
    const connection = buildConnection("offline", {
      online: false,
      transport: "unknown",
      retryCount: 0,
      lastError: null,
      healthStatus: "unknown",
    });

    render(<ConnectionStatusNotice connection={connection} />);

    expect(screen.getByRole("heading", { name: "You're offline" })).toBeInTheDocument();
    expect(
      screen.getByText("Your device appears to be offline. Reconnect to the internet, then try again.")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try compatibility mode" })).not.toBeInTheDocument();
  });

  it("distinguishes reachable backend failures from full backend outages", () => {
    const connection = buildConnection("failed", {
      healthStatus: "reachable",
      problem: "realtime_blocked",
      lastError: "xhr poll error",
    });

    render(<ConnectionStatusNotice connection={connection} />);

    expect(
      screen.getByText(
        "The app loaded, but the live room connection could not be established. A browser extension or network policy may be blocking live updates."
      )
    ).toBeInTheDocument();
  });

  it("keeps compatibility mode obvious once the fallback is active", () => {
    const connection = buildConnection("failed", {
      compatibilityMode: true,
      transport: "polling",
      problem: "transport_failed",
    });
    connection.compatibilityMode = true;

    render(<ConnectionStatusNotice connection={connection} />);

    expect(screen.getAllByText("Compatibility mode active").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Try compatibility mode" })).not.toBeInTheDocument();
  });
});
