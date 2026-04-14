import type { Socket } from "socket.io";
import { logger } from "../utils/logger.js";
import {
  SOCKET_RATE_MAX_EVENTS_PER_IP,
  SOCKET_RATE_MAX_EVENTS_PER_SOCKET,
  SOCKET_RATE_WINDOW_MS,
} from "../config.js";

interface RateState {
  count: number;
  windowStart: number;
}

// Two independent in-memory fixed-window counters (window rolls over whole).
//
// socketRates — per-socket (socket.id). A single misbehaving tab is capped
//   on its own, without punishing other sockets that happen to share the
//   same IP (e.g. NAT / office network).
//
// ipRates — per-client-IP. Stops the trivial escalation path of opening
//   many sockets from one IP to bypass the per-socket cap.
//
// IP trust: "ip" is the trusted-proxy-resolved viewer IP from
// extractClientIp(..., TRUSTED_PROXY_HOP_COUNT). Attacker-supplied XFF
// entries sit left of the trust boundary, so they can't forge keys here.
const socketRates = new Map<string, RateState>();
const ipRates = new Map<string, RateState>();

function hit(map: Map<string, RateState>, key: string, limit: number, nowMs: number): boolean {
  let state = map.get(key);
  if (!state || nowMs - state.windowStart >= SOCKET_RATE_WINDOW_MS) {
    state = { count: 0, windowStart: nowMs };
    map.set(key, state);
  }
  state.count++;
  return state.count > limit;
}

/**
 * Pure helper: record one event for a given socket and IP, return true if
 * either the per-socket or per-IP limit is now exceeded.
 *
 * Exported for unit tests. Production code goes through applySocketRateLimit.
 */
export function recordAndCheckRateLimit(
  socketId: string,
  ip: string,
  nowMs: number = Date.now()
): { limited: boolean; reason: "socket" | "ip" | null } {
  const socketLimited = hit(socketRates, socketId, SOCKET_RATE_MAX_EVENTS_PER_SOCKET, nowMs);
  // Always hit the IP counter too, so sockets over the per-socket cap still
  // contribute to the per-IP tally. This makes bursty clients hit both caps
  // rather than "spending" their over-limit events for free against the IP.
  const ipLimited = hit(ipRates, ip, SOCKET_RATE_MAX_EVENTS_PER_IP, nowMs);

  if (socketLimited) return { limited: true, reason: "socket" };
  if (ipLimited) return { limited: true, reason: "ip" };
  return { limited: false, reason: null };
}

/** Clear state for a given socket. Called on disconnect. */
export function releaseSocketRate(socketId: string): void {
  socketRates.delete(socketId);
}

/**
 * Periodically drop stale IP counter entries. Without this, every unique IP
 * the server ever sees would leak a small Map entry until process restart.
 * Socket counters are cleaned up synchronously on disconnect; IP counters
 * have no natural "disconnect" moment, so they're swept on a timer.
 */
const IP_SWEEP_INTERVAL_MS = SOCKET_RATE_WINDOW_MS * 12; // ~1 minute
let sweepHandle: NodeJS.Timeout | null = setInterval(() => {
  const now = Date.now();
  for (const [ip, state] of ipRates) {
    if (now - state.windowStart >= SOCKET_RATE_WINDOW_MS) {
      ipRates.delete(ip);
    }
  }
}, IP_SWEEP_INTERVAL_MS);
sweepHandle?.unref?.();

/**
 * Test-only: stop the sweeper and clear state. Lets vitest exit cleanly
 * and isolates tests that need a clean counter.
 */
export function __resetRateLimiterForTests(): void {
  socketRates.clear();
  ipRates.clear();
  if (sweepHandle) {
    clearInterval(sweepHandle);
    sweepHandle = null;
  }
}

export function applySocketRateLimit(socket: Socket, ip: string): void {
  socket.use((event, next) => {
    const result = recordAndCheckRateLimit(socket.id, ip, Date.now());
    if (result.limited) {
      logger.warn("Socket rate limited", {
        socketId: socket.id,
        ip,
        reason: result.reason,
        event: event[0],
      });
      next(new Error("RATE_LIMITED"));
      return;
    }
    next();
  });

  socket.on("disconnect", () => {
    releaseSocketRate(socket.id);
  });
}
