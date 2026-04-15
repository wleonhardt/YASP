import { PORT, HOST, STATE_BACKEND_CONFIG } from "./config.js";
import { createServerRuntime, type ServerRuntime } from "./runtime.js";
import { logger } from "./utils/logger.js";

type FatalProcessEvent = "uncaughtException" | "unhandledRejection";

let runtimeRef: ServerRuntime | null = null;
let shuttingDown = false;

function describeUnknownError(value: unknown): {
  message: string;
  stack: string | null;
  context: Record<string, unknown>;
} {
  if (value instanceof Error) {
    return {
      message: value.message || value.name || "Unknown error",
      stack: value.stack ?? null,
      context: {
        name: value.name,
      },
    };
  }

  if (typeof value === "string") {
    return {
      message: value,
      stack: null,
      context: {
        valueType: "string",
      },
    };
  }

  if (typeof value === "number" || typeof value === "boolean" || value === null || value === undefined) {
    return {
      message: String(value),
      stack: null,
      context: {
        valueType: value === null ? "null" : typeof value,
      },
    };
  }

  try {
    return {
      message: "Non-Error throwable",
      stack: null,
      context: {
        valueType: Object.prototype.toString.call(value),
        serialized: JSON.stringify(value),
      },
    };
  } catch {
    return {
      message: "Non-Error throwable",
      stack: null,
      context: {
        valueType: Object.prototype.toString.call(value),
      },
    };
  }
}

async function shutdown(reason: string, exitCode: number): Promise<void> {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  logger.info("Shutting down", { reason, exitCode });

  if (runtimeRef) {
    try {
      await runtimeRef.close();
    } catch (error) {
      logger.error("Failed to close server runtime cleanly", {
        reason,
        exitCode,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    runtimeRef = null;
  }

  process.exit(exitCode);
}

function handleFatalProcessEvent(event: FatalProcessEvent, error: unknown): void {
  const details = describeUnknownError(error);

  logger.error("Fatal process event", {
    event,
    timestamp: new Date().toISOString(),
    message: details.message,
    stack: details.stack,
    context: {
      pid: process.pid,
      nodeVersion: process.version,
      uptimeSeconds: Math.round(process.uptime()),
      ...details.context,
    },
  });

  void shutdown(event, 1);
}

process.on("uncaughtException", (error) => {
  handleFatalProcessEvent("uncaughtException", error);
});

process.on("unhandledRejection", (reason) => {
  handleFatalProcessEvent("unhandledRejection", reason);
});

async function main() {
  logger.info("Selecting state backend", { backend: STATE_BACKEND_CONFIG.kind });
  const runtime = await createServerRuntime(STATE_BACKEND_CONFIG);
  runtimeRef = runtime;
  await runtime.listen({ port: PORT, host: HOST });
  logger.info("Server started", { port: PORT, host: HOST });

  process.on("SIGTERM", () => {
    void shutdown("SIGTERM", 0);
  });
  process.on("SIGINT", () => {
    void shutdown("SIGINT", 0);
  });
}

main().catch((err) => {
  logger.error("Failed to start server", {
    event: "startup_failure",
    timestamp: new Date().toISOString(),
    error: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : null,
  });
  void shutdown("startup_failure", 1);
});
