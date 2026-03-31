import { afterEach, describe, expect, it, vi } from "vitest";
import { installGlobalCrashReporter } from "./crashReporting";

describe("installGlobalCrashReporter", () => {
  let cleanup: (() => void) | null = null;

  afterEach(() => {
    cleanup?.();
    cleanup = null;
    vi.restoreAllMocks();
  });

  it("reports uncaught window errors with sendBeacon when available", async () => {
    const sendBeacon = vi.fn().mockReturnValue(true);
    Object.defineProperty(window.navigator, "sendBeacon", {
      configurable: true,
      value: sendBeacon,
    });

    cleanup = installGlobalCrashReporter();

    const error = new Error("Boom");
    window.dispatchEvent(
      new ErrorEvent("error", {
        message: error.message,
        filename: "http://localhost/src/main.tsx",
        lineno: 27,
        colno: 13,
        error,
      })
    );

    expect(sendBeacon).toHaveBeenCalledTimes(1);
    expect(sendBeacon.mock.calls[0]?.[0]).toBe("/api/client-error");

    const payload = JSON.parse(await sendBeacon.mock.calls[0]?.[1].text()) as Record<string, unknown>;
    expect(payload.type).toBe("error");
    expect(payload.message).toBe("Boom");
    expect(payload.source).toBe("http://localhost/src/main.tsx");
    expect(payload.line).toBe(27);
    expect(payload.column).toBe(13);
  });

  it("falls back to keepalive fetch when sendBeacon is unavailable", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    Object.defineProperty(window.navigator, "sendBeacon", {
      configurable: true,
      value: undefined,
    });
    vi.stubGlobal("fetch", fetchMock);

    cleanup = installGlobalCrashReporter();

    const error = new Error("Fetch fallback");
    window.dispatchEvent(
      new ErrorEvent("error", {
        message: error.message,
        filename: "http://localhost/src/App.tsx",
        error,
      })
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/client-error",
      expect.objectContaining({
        method: "POST",
        keepalive: true,
        credentials: "same-origin",
      })
    );
  });
});
