import {
  CLIENT_ERROR_GLOBAL_RATE_MAX,
  CLIENT_ERROR_GLOBAL_RATE_WINDOW_MS,
  CLIENT_ERROR_MESSAGE_MAX_LENGTH,
  CLIENT_ERROR_STACK_MAX_LENGTH,
  CLIENT_ERROR_URL_MAX_LENGTH,
  CLIENT_ERROR_USER_AGENT_MAX_LENGTH,
} from "../config.js";

/**
 * Hardening helpers for POST /api/client-error.
 *
 * Design goals (F-04, F-11):
 *   - strict field whitelist — unknown fields are dropped, never logged
 *   - strip ASCII control chars so attackers can't plant CloudWatch Insights
 *     escape sequences / forge log lines by embedding newlines
 *   - normalize URLs (href / source) to origin + path, dropping query string
 *     and fragment so shared-link referers don't leak into CloudWatch
 *   - sanitize user-agent and truncate it tight — we want a platform hint,
 *     not a full fingerprint
 *   - keep truncation budgets small enough that one report is always a
 *     single CloudWatch ingestion event of predictable size
 */

/* ---------- string sanitization ---------- */

// Every ASCII control character except HT (0x09), LF (0x0A), CR (0x0D).
// Stripping these protects against log-line forgery (e.g. an attacker
// embedding \x1b[2J to clear a terminal, or null bytes that confuse
// downstream tooling).
// eslint-disable-next-line no-control-regex
const INLINE_CONTROL_CHARS = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;
// Same as above but keeps LF for multi-line fields (stack traces).
// eslint-disable-next-line no-control-regex
const MULTILINE_CONTROL_CHARS = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;

/** Collapse to a single-line value (spaces instead of tabs/newlines) and strip control chars. */
export function sanitizeInlineString(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value
    .replace(INLINE_CONTROL_CHARS, "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/ {2,}/g, " ")
    .trim();
  if (trimmed.length === 0) return null;
  return trimmed.length > maxLength ? trimmed.slice(0, maxLength) : trimmed;
}

/** Multi-line string (stack trace): keep LF, drop CR, strip other control chars. */
export function sanitizeMultilineString(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(MULTILINE_CONTROL_CHARS, "")
    .trim();
  if (normalized.length === 0) return null;
  return normalized.length > maxLength ? normalized.slice(0, maxLength) : normalized;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/* ---------- URL redaction ---------- */

const ALLOWED_URL_PROTOCOLS = new Set(["http:", "https:"]);

/**
 * Return `<origin><pathname>` only. Query strings and fragments are always
 * dropped — they're the main privacy leak vector on referers (F-11) and are
 * never useful for server-side crash triage. Non-http(s) schemes are
 * discarded entirely.
 */
export function sanitizeUrl(value: unknown, maxLength: number = CLIENT_ERROR_URL_MAX_LENGTH): string | null {
  const inline = sanitizeInlineString(value, maxLength * 2);
  if (inline === null) return null;
  let parsed: URL;
  try {
    parsed = new URL(inline);
  } catch {
    return null;
  }
  if (!ALLOWED_URL_PROTOCOLS.has(parsed.protocol)) return null;
  const redacted = `${parsed.origin}${parsed.pathname}`;
  return redacted.length > maxLength ? redacted.slice(0, maxLength) : redacted;
}

/* ---------- user-agent ---------- */

/**
 * Sanitize and cap UA. We intentionally don't parse into a "browser + OS"
 * summary — UA parsing is brittle, the surface area isn't worth it, and a
 * short capped raw string is already low-signal for tracking.
 */
export function sanitizeUserAgent(value: unknown): string | null {
  return sanitizeInlineString(value, CLIENT_ERROR_USER_AGENT_MAX_LENGTH);
}

/* ---------- reportType enum ---------- */

const ALLOWED_REPORT_TYPES = new Set(["error", "unhandledrejection", "unknown"]);

function sanitizeReportType(value: unknown): string {
  const cleaned = sanitizeInlineString(value, 32);
  if (cleaned && ALLOWED_REPORT_TYPES.has(cleaned)) return cleaned;
  return "unknown";
}

/* ---------- whitelisted normalization ---------- */

export type NormalizedClientError = {
  reportType: string;
  message: string;
  stack: string | null;
  context: {
    path: string | null;
    href: string | null;
    source: string | null;
    line: number | null;
    column: number | null;
    userAgent: string | null;
    reportedAt: string | null;
  };
};

const ISO_TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})$/;

function sanitizeIsoTimestamp(value: unknown): string | null {
  const cleaned = sanitizeInlineString(value, 40);
  if (cleaned && ISO_TIMESTAMP_RE.test(cleaned)) return cleaned;
  return null;
}

/** Most request paths are /r/ROOM01 style — bounded, safe. Drop query/hash. */
function sanitizePath(value: unknown): string | null {
  const cleaned = sanitizeInlineString(value, CLIENT_ERROR_URL_MAX_LENGTH);
  if (cleaned === null) return null;
  const queryIdx = cleaned.search(/[?#]/);
  const stripped = queryIdx === -1 ? cleaned : cleaned.slice(0, queryIdx);
  if (stripped.length === 0) return null;
  return stripped;
}

/**
 * Strict whitelist normalizer. Body is only inspected through the named keys
 * below; anything else on the payload is discarded. Every string goes
 * through a sanitizer; every number is validated as finite.
 */
export function normalizeClientErrorReport(body: unknown): NormalizedClientError {
  const raw: Record<string, unknown> =
    body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {};

  return {
    reportType: sanitizeReportType(raw.type),
    message:
      sanitizeInlineString(raw.message, CLIENT_ERROR_MESSAGE_MAX_LENGTH) ??
      "Client crash report received without a message",
    stack: sanitizeMultilineString(raw.stack, CLIENT_ERROR_STACK_MAX_LENGTH),
    context: {
      path: sanitizePath(raw.path),
      href: sanitizeUrl(raw.href),
      source: sanitizeUrl(raw.source),
      line: isFiniteNumber(raw.line) ? raw.line : null,
      column: isFiniteNumber(raw.column) ? raw.column : null,
      userAgent: sanitizeUserAgent(raw.userAgent),
      reportedAt: sanitizeIsoTimestamp(raw.timestamp),
    },
  };
}

/* ---------- referer redaction ---------- */

/** Extract origin + pathname from a Referer header, dropping query and hash. */
export function redactReferer(value: string | string[] | undefined): string | null {
  const header = Array.isArray(value) ? value[0] : value;
  return sanitizeUrl(header);
}

/* ---------- per-IP + global rate gates ---------- */

const PER_IP_WINDOW_MS = 60_000;
const PER_IP_MAX = 10;

type Window = { count: number; windowStart: number };

const perIpWindows = new Map<string, Window>();
let globalWindow: Window = { count: 0, windowStart: 0 };

function bumpWindow(window: Window, windowMs: number, nowMs: number): Window {
  if (window.windowStart === 0 || nowMs - window.windowStart >= windowMs) {
    return { count: 1, windowStart: nowMs };
  }
  return { count: window.count + 1, windowStart: window.windowStart };
}

/**
 * Global ceiling across all IPs (above the per-IP limit) — stops a distributed
 * flood from driving unbounded CloudWatch ingestion. Returns true when the
 * current request should be rejected.
 */
export function recordAndCheckGlobalClientErrorRate(nowMs: number = Date.now()): boolean {
  globalWindow = bumpWindow(globalWindow, CLIENT_ERROR_GLOBAL_RATE_WINDOW_MS, nowMs);
  return globalWindow.count > CLIENT_ERROR_GLOBAL_RATE_MAX;
}

/**
 * Per-IP rate limiter keyed on the trusted `request.ip`. Returns true when
 * the current request should be rejected.
 */
export function recordAndCheckPerIpClientErrorRate(ip: string, nowMs: number = Date.now()): boolean {
  const prev = perIpWindows.get(ip) ?? { count: 0, windowStart: 0 };
  const next = bumpWindow(prev, PER_IP_WINDOW_MS, nowMs);
  perIpWindows.set(ip, next);
  return next.count > PER_IP_MAX;
}

// Sweep stale per-IP entries so the map doesn't grow unbounded.
const perIpSweep: NodeJS.Timeout | null = setInterval(() => {
  const now = Date.now();
  for (const [ip, w] of perIpWindows) {
    if (now - w.windowStart >= PER_IP_WINDOW_MS) perIpWindows.delete(ip);
  }
}, PER_IP_WINDOW_MS);
perIpSweep?.unref?.();

export function __resetClientErrorGlobalRateForTests(): void {
  globalWindow = { count: 0, windowStart: 0 };
  perIpWindows.clear();
}
