import { afterEach, describe, expect, it } from "vitest";
import {
  __resetRateLimiterForTests,
  recordAndCheckRateLimit,
  releaseSocketRate,
} from "../transport/rate-limiter.js";
import {
  SOCKET_RATE_MAX_EVENTS_PER_IP,
  SOCKET_RATE_MAX_EVENTS_PER_SOCKET,
  SOCKET_RATE_WINDOW_MS,
} from "../config.js";

afterEach(() => {
  __resetRateLimiterForTests();
});

describe("recordAndCheckRateLimit — per-socket limit", () => {
  it("allows up to SOCKET_RATE_MAX_EVENTS_PER_SOCKET events per window", () => {
    const now = 1_000_000;
    for (let i = 0; i < SOCKET_RATE_MAX_EVENTS_PER_SOCKET; i++) {
      const r = recordAndCheckRateLimit("sock-A", "1.1.1.1", now);
      expect(r.limited).toBe(false);
    }
    const over = recordAndCheckRateLimit("sock-A", "1.1.1.1", now);
    expect(over.limited).toBe(true);
    expect(over.reason).toBe("socket");
  });

  it("resets after the window rolls over", () => {
    const start = 1_000_000;
    for (let i = 0; i < SOCKET_RATE_MAX_EVENTS_PER_SOCKET + 1; i++) {
      recordAndCheckRateLimit("sock-A", "1.1.1.1", start);
    }
    const afterWindow = start + SOCKET_RATE_WINDOW_MS + 1;
    const r = recordAndCheckRateLimit("sock-A", "1.1.1.1", afterWindow);
    expect(r.limited).toBe(false);
  });

  it("different sockets have independent per-socket budgets", () => {
    const now = 1_000_000;
    for (let i = 0; i < SOCKET_RATE_MAX_EVENTS_PER_SOCKET; i++) {
      recordAndCheckRateLimit("sock-A", "1.1.1.1", now);
    }
    // sock-A is now at the edge — next call would be socket-limited. sock-B
    // from a different IP should still pass, proving state is per-socket.
    const r = recordAndCheckRateLimit("sock-B", "2.2.2.2", now);
    expect(r.limited).toBe(false);
  });
});

describe("recordAndCheckRateLimit — per-IP limit", () => {
  it("multiple sockets on the same IP share the per-IP budget", () => {
    // Spread events across sockets so no single socket hits its per-socket cap.
    // Each socket sends SOCKET_RATE_MAX_EVENTS_PER_SOCKET events (legal per-socket)
    // and we keep allocating sockets until we cross the per-IP threshold.
    const now = 1_000_000;
    const perSocket = SOCKET_RATE_MAX_EVENTS_PER_SOCKET;
    const socketsNeeded = Math.ceil(SOCKET_RATE_MAX_EVENTS_PER_IP / perSocket) + 1;

    let lastResult: { limited: boolean; reason: "socket" | "ip" | null } = {
      limited: false,
      reason: null,
    };
    outer: for (let s = 0; s < socketsNeeded; s++) {
      for (let i = 0; i < perSocket; i++) {
        lastResult = recordAndCheckRateLimit(`sock-${s}`, "10.0.0.1", now);
        if (lastResult.limited) break outer;
      }
    }
    expect(lastResult.limited).toBe(true);
    expect(lastResult.reason).toBe("ip");
  });

  it("different IPs do not share the per-IP budget", () => {
    const now = 1_000_000;
    // Burn through sockets on IP 10.0.0.1 to push its per-IP counter near cap.
    const perSocket = SOCKET_RATE_MAX_EVENTS_PER_SOCKET;
    const socketsNeeded = Math.ceil(SOCKET_RATE_MAX_EVENTS_PER_IP / perSocket);
    for (let s = 0; s < socketsNeeded; s++) {
      for (let i = 0; i < perSocket; i++) {
        recordAndCheckRateLimit(`sock-A-${s}`, "10.0.0.1", now);
      }
    }
    // Fresh socket on a fresh IP must still succeed.
    const other = recordAndCheckRateLimit("sock-X", "9.9.9.9", now);
    expect(other.limited).toBe(false);
  });

  it("per-IP counter decays after the window", () => {
    const start = 1_000_000;
    const perSocket = SOCKET_RATE_MAX_EVENTS_PER_SOCKET;
    const socketsNeeded = Math.ceil(SOCKET_RATE_MAX_EVENTS_PER_IP / perSocket) + 1;
    outer: for (let s = 0; s < socketsNeeded; s++) {
      for (let i = 0; i < perSocket; i++) {
        const r = recordAndCheckRateLimit(`sock-${s}`, "10.0.0.1", start);
        if (r.limited) break outer;
      }
    }

    const afterWindow = start + SOCKET_RATE_WINDOW_MS + 1;
    const r = recordAndCheckRateLimit("sock-fresh", "10.0.0.1", afterWindow);
    expect(r.limited).toBe(false);
  });
});

describe("releaseSocketRate", () => {
  it("clears per-socket counter so a new socket on same id starts fresh", () => {
    const now = 1_000_000;
    for (let i = 0; i < SOCKET_RATE_MAX_EVENTS_PER_SOCKET; i++) {
      recordAndCheckRateLimit("sock-R", "1.1.1.1", now);
    }
    releaseSocketRate("sock-R");
    const r = recordAndCheckRateLimit("sock-R", "1.1.1.1", now);
    expect(r.limited).toBe(false);
  });
});
