import { afterEach, describe, expect, it } from "vitest";
import {
  __resetConnectionLimiterForTests,
  getConnectionCount,
  releaseConnection,
  tryAcquireConnection,
} from "../transport/connection-limiter.js";
import { MAX_SOCKET_CONNECTIONS_PER_IP } from "../config.js";

afterEach(() => {
  __resetConnectionLimiterForTests();
});

describe("tryAcquireConnection", () => {
  it("accepts connections up to the per-IP cap", () => {
    for (let i = 0; i < MAX_SOCKET_CONNECTIONS_PER_IP; i++) {
      expect(tryAcquireConnection("1.1.1.1")).toBe(true);
    }
    expect(getConnectionCount("1.1.1.1")).toBe(MAX_SOCKET_CONNECTIONS_PER_IP);
  });

  it("rejects the connection that would exceed the cap", () => {
    for (let i = 0; i < MAX_SOCKET_CONNECTIONS_PER_IP; i++) {
      tryAcquireConnection("2.2.2.2");
    }
    expect(tryAcquireConnection("2.2.2.2")).toBe(false);
    expect(getConnectionCount("2.2.2.2")).toBe(MAX_SOCKET_CONNECTIONS_PER_IP);
  });

  it("does not share the budget between different IPs", () => {
    for (let i = 0; i < MAX_SOCKET_CONNECTIONS_PER_IP; i++) {
      tryAcquireConnection("3.3.3.3");
    }
    expect(tryAcquireConnection("4.4.4.4")).toBe(true);
    expect(getConnectionCount("4.4.4.4")).toBe(1);
  });
});

describe("releaseConnection", () => {
  it("frees capacity so a rejected IP can connect again", () => {
    for (let i = 0; i < MAX_SOCKET_CONNECTIONS_PER_IP; i++) {
      tryAcquireConnection("5.5.5.5");
    }
    expect(tryAcquireConnection("5.5.5.5")).toBe(false);

    releaseConnection("5.5.5.5");
    expect(tryAcquireConnection("5.5.5.5")).toBe(true);
  });

  it("drops IP from the counter map when it reaches zero", () => {
    tryAcquireConnection("6.6.6.6");
    expect(getConnectionCount("6.6.6.6")).toBe(1);
    releaseConnection("6.6.6.6");
    expect(getConnectionCount("6.6.6.6")).toBe(0);
  });

  it("is a no-op for unknown IPs (avoid negative counters)", () => {
    releaseConnection("never-connected");
    expect(getConnectionCount("never-connected")).toBe(0);
  });
});
