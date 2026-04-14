/**
 * Trusted-proxy-aware client IP resolver.
 *
 * Topology (see config.ts TRUSTED_PROXY_HOP_COUNT for the full reasoning):
 *
 *   viewer → CloudFront edge → nginx (loopback on EC2) → Node
 *
 * `X-Forwarded-For` reaching Node looks like, left-to-right:
 *
 *   [attacker-supplied... , viewer-ip , cloudfront-edge-ip ]
 *    (0..N arbitrary)        appended     appended by nginx
 *                             by CloudFront
 *
 * Walking the chain right-to-left, the closest `trustedHops` addresses are
 * trusted infrastructure; the next address over is the real client IP.
 *
 *   hop 0 = TCP peer          = nginx (127.0.0.1)                trusted
 *   hop 1 = XFF rightmost     = CloudFront edge                   trusted
 *   hop 2 = XFF second-right  = viewer IP                         ← returned
 *   hop 3+                    = attacker-controllable             ignored
 *
 * With `trustedHops = 0` (dev / tests without a proxy) we just return the TCP
 * peer. If the chain is shorter than expected (e.g. someone hit Node directly,
 * or a request with no XFF), we return the leftmost address we can reach —
 * which, without a proxy in front, is the direct peer.
 *
 * This resolver is used for:
 *   - Fastify: indirectly, via the matching `trustProxy` option on the app.
 *     We still expose this helper for Socket.IO and for tests.
 *   - Socket.IO: called on each handshake with handshake headers + address
 *     to drive per-IP connection and event rate limits.
 */

export function extractClientIp(
  headers: Record<string, string | string[] | undefined> | undefined,
  tcpPeer: string | undefined,
  trustedHops: number
): string {
  const xff = headers?.["x-forwarded-for"];
  const xffEntries = parseXForwardedFor(xff);
  // chain is ordered right-to-left: [TCP peer, XFF_last, XFF_second_last, ...]
  const chain: string[] = [];
  const peer = normalizeIp(tcpPeer);
  if (peer) chain.push(peer);
  for (let i = xffEntries.length - 1; i >= 0; i--) {
    chain.push(xffEntries[i]!);
  }
  if (chain.length === 0) return "unknown";

  // Trust the first `trustedHops` entries; return the next one. Clamp to the
  // leftmost available entry if the chain is shorter than trustedHops+1.
  const idx = Math.min(trustedHops, chain.length - 1);
  return chain[idx] ?? "unknown";
}

function parseXForwardedFor(value: string | string[] | undefined): string[] {
  if (value === undefined) return [];
  const raw = Array.isArray(value) ? value.join(",") : value;
  return raw
    .split(",")
    .map((entry) => normalizeIp(entry))
    .filter((entry): entry is string => entry.length > 0);
}

/**
 * Normalize an IP-like string: trim whitespace, strip surrounding brackets on
 * IPv6 literals, drop a trailing `:port` where unambiguous (IPv4 only —
 * IPv6 addresses contain colons themselves so we leave them alone unless
 * they arrive in bracketed form).
 */
function normalizeIp(value: string | undefined): string {
  if (!value) return "";
  let v = value.trim();
  if (v.length === 0) return "";
  // IPv6 in brackets, optionally with port: [::1]:443
  if (v.startsWith("[")) {
    const close = v.indexOf("]");
    if (close > 0) {
      return v.slice(1, close);
    }
  }
  // IPv4 with port: 1.2.3.4:5678  (detect exactly one colon, dotted left)
  const firstColon = v.indexOf(":");
  if (firstColon !== -1 && v.indexOf(":", firstColon + 1) === -1 && v.includes(".")) {
    v = v.slice(0, firstColon);
  }
  return v;
}
