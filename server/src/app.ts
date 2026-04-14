import Fastify from "fastify";
import fastifyHelmet from "@fastify/helmet";
import fastifyStatic from "@fastify/static";
import fastifyCors from "@fastify/cors";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import { logger } from "./utils/logger.js";
import { CLIENT_ERROR_BODY_LIMIT, TRUSTED_PROXY_HOP_COUNT } from "./config.js";
import {
  normalizeClientErrorReport,
  recordAndCheckGlobalClientErrorRate,
  recordAndCheckPerIpClientErrorRate,
  redactReferer,
} from "./transport/client-error.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_ERROR_EVENT = "client_error";

export async function createApp() {
  // trustProxy tells Fastify how many hops of X-Forwarded-For to trust when
  // computing `request.ip`. See config.ts for the topology. Passing 0 as
  // `false` keeps dev/tests (no proxy) behaving like a direct TCP peer.
  const app = Fastify({
    logger: false,
    trustProxy: TRUSTED_PROXY_HOP_COUNT > 0 ? TRUSTED_PROXY_HOP_COUNT : false,
  });

  // Helmet config (PR E / F-08).
  //
  // CSP is enabled with a strict policy tuned to the current Vite-built
  // client. The production `client/dist/index.html` contains NO inline
  // scripts and NO inline <style> tags — all JS and CSS are external
  // same-origin assets. That means:
  //   - script-src 'self'                   (strict; no eval, no inline)
  //   - style-src  'self' 'unsafe-inline'   (React sets `style={...}` via the
  //                                           DOM in a few components, and
  //                                           CSP style-src guards inline
  //                                           style attributes in most UAs —
  //                                           keep 'unsafe-inline' here for
  //                                           robustness; script remains
  //                                           strict, which is the path that
  //                                           matters for XSS)
  //   - connect-src 'self'                  (Socket.IO is same-origin; no
  //                                           cross-origin XHR/fetch targets)
  //   - font-src   'self'                   (we self-host the Inter font)
  //   - img-src    'self' data:             (favicon + any inline SVG)
  //   - frame-ancestors 'none'              (supersedes X-Frame-Options)
  //   - base-uri   'self' / form-action 'self' / object-src 'none'
  //
  // `useDefaults: false` — we don't want Helmet's defaults silently adding
  // `https:` to font/style sources or `upgrade-insecure-requests` (which is
  // a no-op when the document is HTTPS via CloudFront but can surprise local
  // testing of the production build over http://localhost).
  await app.register(fastifyHelmet, {
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        fontSrc: ["'self'"],
        imgSrc: ["'self'", "data:"],
        connectSrc: ["'self'"],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        objectSrc: ["'none'"],
      },
    },
    // Tighter than Helmet's default `no-referrer`: preserves origin on
    // same-origin navigations (useful for analytics/debugging) while
    // stripping the path on cross-origin requests.
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  });

  // Permissions-Policy — not shipped as a Helmet middleware today, so set it
  // via an onSend hook. Disables a handful of sensitive hardware APIs the app
  // has never needed and never will.
  app.addHook("onSend", async (_request, reply) => {
    reply.header("Permissions-Policy", "geolocation=(), microphone=(), camera=(), payment=()");
  });

  if (process.env.NODE_ENV !== "production") {
    await app.register(fastifyCors, {
      origin: ["http://localhost:5173"],
    });
  }

  app.get("/api/health", async () => {
    return { ok: true };
  });

  app.post(
    "/api/client-error",
    {
      // Route-scoped body cap. Fastify emits 413 at the parser before any
      // handler / sanitizer work runs.
      bodyLimit: CLIENT_ERROR_BODY_LIMIT,
    },
    async (request, reply) => {
      // Global ceiling first: rejects cheaply under a distributed flood.
      if (recordAndCheckGlobalClientErrorRate()) {
        return reply.code(429).send({ ok: false, error: "Server is dropping crash reports" });
      }

      // Per-IP limit using the trusted `request.ip`. With trustProxy set,
      // this is the real viewer IP — not an attacker-forgeable XFF entry.
      const clientIp = request.ip;
      if (recordAndCheckPerIpClientErrorRate(clientIp)) {
        return reply.code(429).send({ ok: false, error: "Too many error reports" });
      }

      const normalized = normalizeClientErrorReport(request.body);
      const refererRedacted = redactReferer(request.headers.referer);

      // Demoted to `warn`: these are client-side crashes that we want visible
      // but should not page on; previous `error` level caused alert noise.
      logger.warn("Client runtime error", {
        event: CLIENT_ERROR_EVENT,
        reportType: normalized.reportType,
        message: normalized.message,
        stack: normalized.stack,
        // Only whitelisted fields below. Raw forwarded-for / user-agent / raw
        // referer are NOT logged — they're either attacker-controlled,
        // privacy-sensitive (F-11), or duplicated by the trusted clientIp.
        context: {
          requestId: request.id,
          clientIp,
          referer: refererRedacted,
          ...normalized.context,
        },
      });

      return reply.code(202).send({ ok: true });
    }
  );

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
