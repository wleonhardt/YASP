import { MAX_SOCKET_CONNECTIONS_PER_IP } from "../config.js";

/**
 * Per-IP concurrent Socket.IO connection limiter.
 *
 * In-memory counter keyed by IP. Incremented on successful acquire, decremented
 * on release (typically from the socket `disconnect` handler). If an IP hits
 * MAX_SOCKET_CONNECTIONS_PER_IP, new connection attempts are rejected before
 * any application event handlers run.
 *
 * Deliberately simple — no external store, no quota refill timer, no log spam
 * per-attempt. The caller is responsible for pairing acquire/release calls.
 *
 * IP trust: the `ip` arg is the value returned by `extractClientIp` keyed
 * to TRUSTED_PROXY_HOP_COUNT. In production that's the real viewer IP after
 * stripping the nginx + CloudFront hops; attacker-supplied XFF entries sit
 * left of the trust boundary and never become the key here. See
 * transport/ip.ts for the topology reasoning.
 */

const counts = new Map<string, number>();

export function tryAcquireConnection(ip: string): boolean {
  const current = counts.get(ip) ?? 0;
  if (current >= MAX_SOCKET_CONNECTIONS_PER_IP) {
    return false;
  }
  counts.set(ip, current + 1);
  return true;
}

export function releaseConnection(ip: string): void {
  const current = counts.get(ip) ?? 0;
  if (current <= 1) {
    counts.delete(ip);
    return;
  }
  counts.set(ip, current - 1);
}

/** Read-only accessor for tests / diagnostics. */
export function getConnectionCount(ip: string): number {
  return counts.get(ip) ?? 0;
}

/** Test-only reset. */
export function __resetConnectionLimiterForTests(): void {
  counts.clear();
}
