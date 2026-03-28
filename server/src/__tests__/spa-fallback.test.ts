import { describe, it, expect, beforeAll, afterAll } from "vitest";
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
