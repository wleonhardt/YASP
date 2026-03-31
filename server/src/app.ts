import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import fastifyCors from "@fastify/cors";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import { logger } from "./utils/logger.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_ERROR_EVENT = "client_error";
const MAX_LOG_FIELD_LENGTH = 4_000;
const MAX_STACK_LENGTH = 12_000;

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}

function toOptionalString(value: unknown, maxLength = MAX_LOG_FIELD_LENGTH): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }

  return truncate(trimmed, maxLength);
}

function toOptionalNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function summarizeUnknown(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "string") {
    return truncate(value, MAX_LOG_FIELD_LENGTH);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (value instanceof Error) {
    return truncate(`${value.name}: ${value.message}`, MAX_LOG_FIELD_LENGTH);
  }

  try {
    const serialized = JSON.stringify(value);
    return serialized ? truncate(serialized, MAX_LOG_FIELD_LENGTH) : null;
  } catch {
    return Object.prototype.toString.call(value);
  }
}

function normalizeClientErrorPayload(body: unknown): Record<string, unknown> {
  const raw =
    typeof body === "string"
      ? (() => {
          try {
            return JSON.parse(body);
          } catch {
            return { message: body };
          }
        })()
      : body;

  if (!raw || typeof raw !== "object") {
    return {
      reportType: "unknown",
      message: "Invalid client crash payload",
      stack: null,
      context: {},
    };
  }

  const record = raw as Record<string, unknown>;

  return {
    reportType: toOptionalString(record.type) ?? "unknown",
    message: toOptionalString(record.message) ?? "Client crash report received without a message",
    stack: toOptionalString(record.stack, MAX_STACK_LENGTH),
    context: {
      name: toOptionalString(record.name),
      reason: summarizeUnknown(record.reason),
      source: toOptionalString(record.source),
      line: toOptionalNumber(record.line),
      column: toOptionalNumber(record.column),
      href: toOptionalString(record.href),
      path: toOptionalString(record.path),
      userAgent: toOptionalString(record.userAgent),
      reportedAt: toOptionalString(record.timestamp),
    },
  };
}

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

  app.post("/api/client-error", async (request, reply) => {
    const normalized = normalizeClientErrorPayload(request.body);

    logger.error("Client runtime error", {
      event: CLIENT_ERROR_EVENT,
      timestamp: new Date().toISOString(),
      reportType: normalized.reportType,
      message: normalized.message,
      stack: normalized.stack,
      context: {
        requestId: request.id,
        forwardedFor:
          typeof request.headers["x-forwarded-for"] === "string" ? request.headers["x-forwarded-for"] : null,
        userAgent:
          (normalized.context as Record<string, unknown>).userAgent ??
          (typeof request.headers["user-agent"] === "string" ? request.headers["user-agent"] : null),
        referer: typeof request.headers.referer === "string" ? request.headers.referer : null,
        ...((normalized.context as Record<string, unknown>) ?? {}),
      },
    });

    return reply.code(202).send({ ok: true });
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
