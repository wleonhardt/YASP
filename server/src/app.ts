import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import fastifyCors from "@fastify/cors";
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

  // In production, serve static assets from the client build
  const clientDistPath = path.resolve(__dirname, "../../client/dist");
  if (fs.existsSync(clientDistPath)) {
    await app.register(fastifyStatic, {
      root: clientDistPath,
      prefix: "/",
    });

    // SPA fallback: serve index.html only for navigation requests to client-side routes.
    // Do NOT rewrite asset paths (/assets/), API paths (/api/), or socket.io paths.
    app.setNotFoundHandler(async (request, reply) => {
      const url = request.url;
      if (url.startsWith("/api/") || url.startsWith("/socket.io/") || url.startsWith("/assets/")) {
        return reply.code(404).send({ error: "Not found" });
      }
      return reply.sendFile("index.html");
    });
  }

  return app;
}
