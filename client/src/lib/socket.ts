import { io, Socket } from "socket.io-client";

function resolveRealtimeBaseUrl(): string {
  if (import.meta.env.PROD) {
    return typeof window !== "undefined" ? window.location.origin : "/";
  }

  return "http://localhost:3001";
}

export function getRealtimeBaseUrl(): string {
  return resolveRealtimeBaseUrl();
}

export function getHealthProbeUrl(): string {
  return new URL("/api/health", resolveRealtimeBaseUrl()).toString();
}

export function createSocket(options: { compatibilityMode?: boolean } = {}): Socket {
  const compatibilityMode = options.compatibilityMode ?? false;

  return io(resolveRealtimeBaseUrl(), {
    autoConnect: false,
    transports: compatibilityMode ? ["polling"] : ["websocket", "polling"],
    upgrade: !compatibilityMode,
  });
}
