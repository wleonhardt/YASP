import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { createApp } from "../app.js";
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
    // Only run if client/dist exists (i.e., after npm run build:client)
    if (!hasClientDist) return;
    app = await createApp();
    await app.ready();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  afterEach(() => {
    vi.restoreAllMocks();
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

  it("accepts browser crash reports and logs them as structured client_error events", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const testApp = await createApp();
    await testApp.ready();

    const payload = {
      type: "error",
      message: "Boom on room page",
      stack: "Error: Boom\\n    at RoomPage",
      href: "https://app.yasp.team/r/ROOM01",
      path: "/r/ROOM01",
      source: "https://app.yasp.team/assets/index.js",
      line: 120,
      column: 8,
      userAgent: "Vitest Browser",
      timestamp: "2026-03-31T16:45:00.000Z",
    };

    const res = await testApp.inject({
      method: "POST",
      url: "/api/client-error",
      payload,
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": "203.0.113.8",
        "user-agent": "Vitest Browser",
      },
    });

    expect(res.statusCode).toBe(202);
    expect(res.json()).toEqual({ ok: true });
    expect(errorSpy).toHaveBeenCalledTimes(1);

    const logged = JSON.parse(errorSpy.mock.calls[0]?.[0] as string) as Record<string, unknown>;
    expect(logged.event).toBe("client_error");
    expect(logged.message).toBe(payload.message);
    expect(logged.reportType).toBe(payload.type);
    expect(logged.stack).toBe(payload.stack);
    expect(logged.context).toMatchObject({
      path: payload.path,
      href: payload.href,
      source: payload.source,
      line: payload.line,
      column: payload.column,
      userAgent: payload.userAgent,
      forwardedFor: "203.0.113.8",
    });

    await testApp.close();
  });
});
