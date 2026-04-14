import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { createApp } from "../app.js";
import { CLIENT_ERROR_BODY_LIMIT, CLIENT_ERROR_USER_AGENT_MAX_LENGTH } from "../config.js";
import { __resetClientErrorGlobalRateForTests } from "../transport/client-error.js";
import type { FastifyInstance } from "fastify";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("SPA fallback (production static serving)", () => {
  let app: FastifyInstance;
  const clientDistPath = path.resolve(__dirname, "../../../client/dist");
  const hasClientDist = fs.existsSync(clientDistPath);

  beforeAll(async () => {
    if (!hasClientDist) return;
    app = await createApp();
    await app.ready();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    __resetClientErrorGlobalRateForTests();
  });

  it.skipIf(!hasClientDist)("serves index.html for client-side route /r/ABCDEF", async () => {
    const res = await app.inject({ method: "GET", url: "/r/ABCDEF" });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/html");
    expect(res.body).toContain('<div id="root">');
  });

  it.skipIf(!hasClientDist)("returns 404 JSON for /api/nonexistent", async () => {
    const res = await app.inject({ method: "GET", url: "/api/nonexistent" });
    expect(res.statusCode).toBe(404);
    expect(res.headers["content-type"]).toContain("application/json");
  });

  it.skipIf(!hasClientDist)("returns 404 for /socket.io/nonexistent", async () => {
    const res = await app.inject({ method: "GET", url: "/socket.io/nonexistent" });
    expect(res.statusCode).toBe(404);
  });

  it.skipIf(!hasClientDist)("returns 404 for missing /assets/ files", async () => {
    const res = await app.inject({ method: "GET", url: "/assets/nonexistent.js" });
    expect(res.statusCode).toBe(404);
  });

  it("serves /api/health", async () => {
    const testApp = await createApp();
    await testApp.ready();
    const res = await testApp.inject({ method: "GET", url: "/api/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
    await testApp.close();
  });
});

describe("browser security headers (PR E / F-08)", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createApp();
    await app.ready();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  async function getHeaders(url: string): Promise<Record<string, string>> {
    const res = await app.inject({ method: "GET", url });
    // Normalize header values to string (Fastify may surface arrays).
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(res.headers)) {
      out[k.toLowerCase()] = Array.isArray(v) ? v.join(", ") : String(v ?? "");
    }
    return out;
  }

  it("emits a Content-Security-Policy header on /api/health", async () => {
    const h = await getHeaders("/api/health");
    expect(h["content-security-policy"]).toBeDefined();
  });

  it("CSP contains the strict script-src 'self' directive (no 'unsafe-inline' on scripts)", async () => {
    const h = await getHeaders("/api/health");
    const csp = h["content-security-policy"]!;
    expect(csp).toMatch(/script-src[^;]*'self'/);
    // Regression guard — scripts must never be relaxed to unsafe-inline/eval.
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-eval'/);
  });

  it("CSP contains the key isolation directives", async () => {
    const h = await getHeaders("/api/health");
    const csp = h["content-security-policy"]!;
    expect(csp).toMatch(/default-src 'self'/);
    expect(csp).toMatch(/connect-src 'self'/);
    expect(csp).toMatch(/img-src[^;]*'self'[^;]*data:/);
    expect(csp).toMatch(/font-src 'self'/);
    expect(csp).toMatch(/frame-ancestors 'none'/);
    expect(csp).toMatch(/base-uri 'self'/);
    expect(csp).toMatch(/form-action 'self'/);
    expect(csp).toMatch(/object-src 'none'/);
  });

  it("sets Referrer-Policy: strict-origin-when-cross-origin", async () => {
    const h = await getHeaders("/api/health");
    expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  });

  it("sets Permissions-Policy disabling geolocation/microphone/camera/payment", async () => {
    const h = await getHeaders("/api/health");
    const pp = h["permissions-policy"]!;
    expect(pp).toContain("geolocation=()");
    expect(pp).toContain("microphone=()");
    expect(pp).toContain("camera=()");
    expect(pp).toContain("payment=()");
  });

  it("sets X-Content-Type-Options: nosniff", async () => {
    const h = await getHeaders("/api/health");
    expect(h["x-content-type-options"]).toBe("nosniff");
  });

  it("CSP frame-ancestors 'none' is the authoritative frame guard (X-Frame-Options may or may not be present)", async () => {
    // Helmet sets X-Frame-Options: SAMEORIGIN by default as a legacy fallback.
    // frame-ancestors 'none' in CSP is the real guard on modern browsers and
    // takes precedence. Assert the CSP directive is the stricter one.
    const h = await getHeaders("/api/health");
    expect(h["content-security-policy"]).toMatch(/frame-ancestors 'none'/);
  });
});

describe("/api/client-error", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    __resetClientErrorGlobalRateForTests();
  });

  it("accepts well-formed crash reports and logs only whitelisted fields at warn level", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const testApp = await createApp();
    await testApp.ready();

    const payload = {
      type: "error",
      message: "Boom on room page",
      stack: "Error: Boom\n    at RoomPage\n    at doWork",
      href: "https://app.yasp.team/r/ROOM01?token=secret",
      path: "/r/ROOM01?token=secret",
      source: "https://app.yasp.team/assets/index.js",
      line: 120,
      column: 8,
      userAgent: "Vitest Browser",
      timestamp: "2026-03-31T16:45:00.000Z",
      // Unknown/attacker-injected keys that must NOT appear in the log.
      reason: "attacker-supplied-reason",
      name: "attacker-supplied-name",
      bonusField: { nested: "ignored" },
    };

    const res = await testApp.inject({
      method: "POST",
      url: "/api/client-error",
      payload,
      headers: {
        "content-type": "application/json",
        referer: "https://app.yasp.team/r/ROOM01?invite=abc#section",
        "user-agent": "Vitest Browser",
      },
    });

    expect(res.statusCode).toBe(202);
    expect(res.json()).toEqual({ ok: true });
    // New behavior: demoted from error to warn.
    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledTimes(1);

    const logged = JSON.parse(warnSpy.mock.calls[0]?.[0] as string) as Record<string, unknown>;
    expect(logged.level).toBe("warn");
    expect(logged.event).toBe("client_error");
    expect(logged.reportType).toBe("error");
    expect(logged.message).toBe(payload.message);
    expect(logged.stack).toBe(payload.stack);

    const ctx = logged.context as Record<string, unknown>;
    // Query string and fragment stripped from referer, href, and path.
    expect(ctx.referer).toBe("https://app.yasp.team/r/ROOM01");
    expect(ctx.href).toBe("https://app.yasp.team/r/ROOM01");
    expect(ctx.path).toBe("/r/ROOM01");
    expect(ctx.source).toBe("https://app.yasp.team/assets/index.js");
    expect(ctx.userAgent).toBe("Vitest Browser");
    expect(ctx.reportedAt).toBe(payload.timestamp);

    // Attacker-controlled / privacy-leaking fields explicitly not logged.
    expect(ctx).not.toHaveProperty("forwardedFor");
    expect(ctx).not.toHaveProperty("reason");
    expect(ctx).not.toHaveProperty("name");
    expect(ctx).not.toHaveProperty("bonusField");

    await testApp.close();
  });

  it("strips ASCII control characters and normalizes inline whitespace in the message", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const testApp = await createApp();
    await testApp.ready();

    const payload = {
      type: "error",
      // Embedded NUL, backspace, ESC, and a CR+LF newline sequence that an
      // attacker could use to forge a second log line.
      message: "normal\u0000text\u001bESC\r\nfake-log-entry\tafter-tab",
    };

    const res = await testApp.inject({
      method: "POST",
      url: "/api/client-error",
      payload,
      headers: { "content-type": "application/json" },
    });
    expect(res.statusCode).toBe(202);

    const logged = JSON.parse(warnSpy.mock.calls[0]?.[0] as string) as Record<string, unknown>;
    expect(logged.message).toBe("normaltextESC fake-log-entry after-tab");
    await testApp.close();
  });

  it("preserves newlines in stack trace but strips other control chars", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const testApp = await createApp();
    await testApp.ready();

    const payload = {
      type: "error",
      message: "Boom",
      stack: "Error: Boom\n\u0000    at a\n    at b\u001b",
    };

    const res = await testApp.inject({
      method: "POST",
      url: "/api/client-error",
      payload,
      headers: { "content-type": "application/json" },
    });
    expect(res.statusCode).toBe(202);

    const logged = JSON.parse(warnSpy.mock.calls[0]?.[0] as string) as Record<string, unknown>;
    expect(logged.stack).toBe("Error: Boom\n    at a\n    at b");
    await testApp.close();
  });

  it("drops non-http(s) URLs in href / source", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const testApp = await createApp();
    await testApp.ready();

    const res = await testApp.inject({
      method: "POST",
      url: "/api/client-error",
      payload: {
        type: "error",
        message: "Boom",
        href: "javascript:alert(1)",
        source: "data:text/html;base64,PHNjcmlwdD4=",
      },
      headers: { "content-type": "application/json" },
    });
    expect(res.statusCode).toBe(202);

    const ctx = (JSON.parse(warnSpy.mock.calls[0]?.[0] as string) as Record<string, unknown>)
      .context as Record<string, unknown>;
    expect(ctx.href).toBeNull();
    expect(ctx.source).toBeNull();
  });

  it("caps user-agent length", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const testApp = await createApp();
    await testApp.ready();

    const longUa = "A".repeat(CLIENT_ERROR_USER_AGENT_MAX_LENGTH + 200);
    const res = await testApp.inject({
      method: "POST",
      url: "/api/client-error",
      payload: { type: "error", message: "Boom", userAgent: longUa },
      headers: { "content-type": "application/json" },
    });
    expect(res.statusCode).toBe(202);

    const ctx = (JSON.parse(warnSpy.mock.calls[0]?.[0] as string) as Record<string, unknown>)
      .context as Record<string, unknown>;
    expect((ctx.userAgent as string).length).toBe(CLIENT_ERROR_USER_AGENT_MAX_LENGTH);
    await testApp.close();
  });

  it("drops non-ISO timestamps", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const testApp = await createApp();
    await testApp.ready();

    const res = await testApp.inject({
      method: "POST",
      url: "/api/client-error",
      payload: { type: "error", message: "Boom", timestamp: "yesterday at noon" },
      headers: { "content-type": "application/json" },
    });
    expect(res.statusCode).toBe(202);

    const ctx = (JSON.parse(warnSpy.mock.calls[0]?.[0] as string) as Record<string, unknown>)
      .context as Record<string, unknown>;
    expect(ctx.reportedAt).toBeNull();
    await testApp.close();
  });

  it("rejects payloads larger than the route body limit with 413", async () => {
    const testApp = await createApp();
    await testApp.ready();

    const oversized = "x".repeat(CLIENT_ERROR_BODY_LIMIT + 1_000);
    const res = await testApp.inject({
      method: "POST",
      url: "/api/client-error",
      payload: { type: "error", message: oversized },
      headers: { "content-type": "application/json" },
    });

    expect(res.statusCode).toBe(413);
    await testApp.close();
  });

  it("returns 429 when the per-IP limit is exceeded", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const testApp = await createApp();
    await testApp.ready();

    let last = 0;
    // Per-IP cap is 10/min. 11 requests from the same peer → 11th gets 429.
    for (let i = 0; i < 11; i++) {
      const res = await testApp.inject({
        method: "POST",
        url: "/api/client-error",
        payload: { type: "error", message: `#${i}` },
        headers: { "content-type": "application/json" },
      });
      last = res.statusCode;
    }
    expect(last).toBe(429);
    await testApp.close();
  });
});
