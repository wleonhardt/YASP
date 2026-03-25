import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import fastifyCors from "@fastify/cors";
import { getPublicConfig } from "./config.js";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function createApp() {
  const app = Fastify({ logger: false });

  if (process.env.NODE_ENV !== "production") {
    await app.register(fastifyCors, {
      origin: ["http://localhost:5173"],
    });
  }

  // API routes
  app.get("/api/health", async () => {
    return { ok: true };
  });

  app.get("/api/config", async () => {
    return getPublicConfig();
  });

  // In production, serve static assets from the client build
  const clientDistPath = path.resolve(__dirname, "../../client/dist");
  if (fs.existsSync(clientDistPath)) {
    await app.register(fastifyStatic, {
      root: clientDistPath,
      prefix: "/",
    });

    // SPA fallback: serve index.html for client-side routes (not asset files)
    app.setNotFoundHandler(async (_request, reply) => {
      return reply.sendFile("index.html");
    });
  }

  return app;
}
