export const PORT = parseInt(process.env.PORT || "3001", 10);
export const HOST = process.env.HOST || "0.0.0.0";

export const ROOM_TTL_MS = 12 * 60 * 60 * 1000;
export const DISCONNECTED_PARTICIPANT_GRACE_MS = 30 * 60 * 1000;
export const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
export const MAX_ROOM_PARTICIPANTS = 100;

// Shorter TTL for rooms that were created but never had any meaningful activity.
// Used when the last connected participant leaves a never-active room so
// abandoned rooms don't linger for the full ROOM_TTL_MS.
export const EMPTY_ROOM_TTL_MS = 5 * 60 * 1000;

// Global cap on rooms stored in-memory. Above this, new room creation is
// rejected with SERVER_BUSY. Sized for a single small instance.
export const MAX_ACTIVE_ROOMS = 10_000;

// Per-sessionId cap on rooms where the session is currently moderator.
// Prevents one honest client from spamming rooms. Attackers rotating
// sessionIds are constrained by per-IP connection/event caps instead.
export const MAX_ROOMS_MODERATED_PER_SESSION = 5;

// Per-IP concurrent Socket.IO connection cap. Excess upgrades are rejected.
export const MAX_SOCKET_CONNECTIONS_PER_IP = 20;

// Per-socket and per-IP event rate limits (sliding 5s window).
export const SOCKET_RATE_WINDOW_MS = 5_000;
export const SOCKET_RATE_MAX_EVENTS_PER_SOCKET = 50;
export const SOCKET_RATE_MAX_EVENTS_PER_IP = 500;

// Socket.IO payload cap. Our largest legitimate event is a serialized room
// with up to MAX_ROOM_PARTICIPANTS participants, well under 16 KB.
export const SOCKET_MAX_HTTP_BUFFER_SIZE = 16_384;

// /api/client-error body cap. Route-scoped; Fastify rejects with 413 before
// parser work. Our truncation ceilings below sum to well under this limit.
export const CLIENT_ERROR_BODY_LIMIT = 32_768;

// /api/client-error field ceilings. Tighter than the pre-PR-C limits so the
// log line fits comfortably in a single CloudWatch event and so control-char
// stripping has a bounded cost.
export const CLIENT_ERROR_MESSAGE_MAX_LENGTH = 1_000;
export const CLIENT_ERROR_STACK_MAX_LENGTH = 4_000;
export const CLIENT_ERROR_URL_MAX_LENGTH = 300;
export const CLIENT_ERROR_USER_AGENT_MAX_LENGTH = 160;

// Global ceiling across all IPs for /api/client-error. Sits above the per-IP
// cap so a distributed flood can't drive unbounded CloudWatch ingestion.
export const CLIENT_ERROR_GLOBAL_RATE_WINDOW_MS = 60_000;
export const CLIENT_ERROR_GLOBAL_RATE_MAX = 200;

// Trusted proxy hop count for Fastify `trustProxy` and our Socket.IO IP
// resolver. Describes the topology between the attacker and Node:
//
//   viewer → CloudFront edge → nginx (loopback on EC2) → Node
//
// From Node's point of view, the closest 2 addresses are always trusted:
//   hop 0 = TCP peer     = nginx (127.0.0.1)
//   hop 1 = XFF rightmost = CloudFront edge IP (appended by nginx via
//                            $proxy_add_x_forwarded_for)
//   hop 2 = XFF next      = actual viewer IP (appended by CloudFront)
//
// So trusting 2 hops gives us the real viewer IP at hop 2. Anything to the
// left of that in XFF is attacker-supplied and ignored.
//
// In non-production (local dev, tests via app.inject) there is no proxy in
// front of Node, so we don't trust any hops and `request.ip` is the direct
// TCP peer. Override with YASP_TRUSTED_PROXY_HOPS for unusual deployments.
function resolveTrustedProxyHops(): number {
  const raw = process.env.YASP_TRUSTED_PROXY_HOPS;
  if (raw !== undefined) {
    const parsed = Number.parseInt(raw, 10);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }
  return process.env.NODE_ENV === "production" ? 2 : 0;
}
export const TRUSTED_PROXY_HOP_COUNT = resolveTrustedProxyHops();

// ---------------------------------------------------------------------------
// Optional horizontal-scaling backend (Phase 2 prototype).
//
// Default stays `memory` — in-process Map-backed stores, identical to the
// behavior before Phase 2. Setting `YASP_STATE_BACKEND=redis` instantiates
// the Redis-backed prototypes (RedisRoomStore / RedisSessionBindingStore) and
// requires `REDIS_URL` to be set. Redis mode is ephemeral shared active-room
// state only — no history, no archive, no accounts. See ADR 0002.
// ---------------------------------------------------------------------------
export type StateBackend = "memory" | "redis";

export type StateBackendConfig =
  | { kind: "memory" }
  | { kind: "redis"; redisUrl: string };

function resolveStateBackendConfig(): StateBackendConfig {
  const raw = (process.env.YASP_STATE_BACKEND ?? "memory").trim().toLowerCase();
  if (raw === "" || raw === "memory") return { kind: "memory" };
  if (raw === "redis") {
    const redisUrl = process.env.REDIS_URL?.trim();
    if (!redisUrl) {
      throw new Error(
        "YASP_STATE_BACKEND=redis requires REDIS_URL to be set (e.g. redis://host:6379/0)."
      );
    }
    return { kind: "redis", redisUrl };
  }
  throw new Error(
    `Unknown YASP_STATE_BACKEND value: ${JSON.stringify(raw)}. Supported: memory, redis.`
  );
}

/**
 * Resolved state-backend configuration. Read once at startup. Changing
 * `YASP_STATE_BACKEND` / `REDIS_URL` requires a process restart.
 */
export const STATE_BACKEND_CONFIG: StateBackendConfig = resolveStateBackendConfig();

// Per-participant minimum interval between two successive honks from the same
// participant in a room. The existing room-level cooldown
// (`ROOM_TIMER_HONK_COOLDOWN_MS` = 5s) already bounds honk traffic per room,
// but that is a room-scoped gate — if the honk permission ever widens beyond
// moderator-only, multiple participants could together exceed a reasonable
// per-sender rate. This is a defense-in-depth ceiling per F-10. Kept shorter
// than the room cooldown so it never tightens the current mod-only flow.
export const PARTICIPANT_HONK_COOLDOWN_MS = 2_000;
