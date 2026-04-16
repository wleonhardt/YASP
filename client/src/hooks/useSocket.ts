import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import {
  classifyConnectionProblem,
  normalizeTransportName,
  sanitizeConnectionError,
  type ConnectionDiagnostics,
  type ConnectionStatus,
  type ConnectionTransport,
  type HealthProbeStatus,
} from "../lib/connectionRecovery";
import { createSocket, getHealthProbeUrl, getRealtimeBaseUrl } from "../lib/socket";

const FAILURE_RETRY_THRESHOLD = 2;
const HEALTH_PROBE_TIMEOUT_MS = 3_500;
const HEALTH_PROBE_COOLDOWN_MS = 10_000;

export type SocketConnectionState = {
  socket: Socket;
  status: ConnectionStatus;
  compatibilityMode: boolean;
  diagnostics: ConnectionDiagnostics;
  retry: () => void;
  enableCompatibilityMode: () => void;
};

function getBrowserOnlineState(): boolean {
  if (typeof navigator === "undefined" || typeof navigator.onLine !== "boolean") {
    return true;
  }

  return navigator.onLine;
}

function getBrowserOrigin(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  return window.location.origin;
}

export function useSocket(): SocketConnectionState {
  const [compatibilityMode, setCompatibilityMode] = useState(false);
  const [socket, setSocket] = useState<Socket>(() => createSocket());
  const [status, setStatus] = useState<ConnectionStatus>(() =>
    getBrowserOnlineState() ? "connecting" : "offline"
  );
  const [transport, setTransport] = useState<ConnectionTransport>("unknown");
  const [online, setOnline] = useState(getBrowserOnlineState);
  const [retryCount, setRetryCount] = useState(0);
  const [lastError, setLastError] = useState<string | null>(null);
  const [lastConnectedAt, setLastConnectedAt] = useState<number | null>(null);
  const [healthStatus, setHealthStatus] = useState<HealthProbeStatus>("unknown");

  const hasConnectedRef = useRef(false);
  const retryCountRef = useRef(0);
  const lastProbeAtRef = useRef(0);
  const onlineRef = useRef(online);

  useEffect(() => {
    onlineRef.current = online;
  }, [online]);

  useEffect(() => {
    const manager = socket.io;
    let trackedEngine = manager.engine;

    const syncTransport = () => {
      setTransport(normalizeTransportName(manager.engine?.transport?.name));
    };

    const bindEngineEvents = () => {
      if (trackedEngine === manager.engine) {
        return;
      }

      if (trackedEngine) {
        trackedEngine.off("upgrade", syncTransport);
      }

      trackedEngine = manager.engine;
      trackedEngine?.on("upgrade", syncTransport);
      syncTransport();
    };

    const handleConnect = () => {
      hasConnectedRef.current = true;
      retryCountRef.current = 0;
      setRetryCount(0);
      setLastError(null);
      setHealthStatus("unknown");
      setStatus("connected");
      setLastConnectedAt(Date.now());
      bindEngineEvents();
      syncTransport();
    };

    const handleDisconnect = (reason: string) => {
      syncTransport();

      if (!onlineRef.current) {
        setStatus("offline");
        setHealthStatus("unknown");
        return;
      }

      if (reason === "io client disconnect") {
        return;
      }

      setHealthStatus("unknown");
      setStatus(hasConnectedRef.current ? "reconnecting" : "connecting");
    };

    const handleConnectError = (error: unknown) => {
      setLastError(sanitizeConnectionError(error));
      setHealthStatus("unknown");
      syncTransport();

      if (!onlineRef.current) {
        setStatus("offline");
        return;
      }

      setStatus(retryCountRef.current > FAILURE_RETRY_THRESHOLD ? "failed" : "connecting");
    };

    const handleReconnectAttempt = (attempt: number) => {
      retryCountRef.current = attempt;
      setRetryCount(attempt);
      setHealthStatus("unknown");
      setStatus(hasConnectedRef.current ? "reconnecting" : "connecting");
      syncTransport();
    };

    const handleReconnectError = (error: unknown) => {
      setLastError(sanitizeConnectionError(error));
    };

    const handleReconnectFailed = () => {
      if (!onlineRef.current) {
        setStatus("offline");
        return;
      }

      setStatus("failed");
    };

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("connect_error", handleConnectError);
    manager.on("open", bindEngineEvents);
    manager.on("reconnect_attempt", handleReconnectAttempt);
    manager.on("reconnect_error", handleReconnectError);
    manager.on("reconnect_failed", handleReconnectFailed);

    bindEngineEvents();
    syncTransport();

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("connect_error", handleConnectError);
      manager.off("open", bindEngineEvents);
      manager.off("reconnect_attempt", handleReconnectAttempt);
      manager.off("reconnect_error", handleReconnectError);
      manager.off("reconnect_failed", handleReconnectFailed);
      trackedEngine?.off("upgrade", syncTransport);
      socket.disconnect();
    };
  }, [socket]);

  useEffect(() => {
    if (!online) {
      setStatus("offline");
      setHealthStatus("unknown");
      socket.disconnect();
      return;
    }

    if (!socket.connected) {
      setStatus(hasConnectedRef.current ? "reconnecting" : "connecting");
      socket.connect();
    }
  }, [online, socket]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleOnline = () => {
      setOnline(true);
      retryCountRef.current = 0;
      setRetryCount(0);
      setLastError(null);
      setHealthStatus("unknown");
      setStatus(hasConnectedRef.current ? "reconnecting" : "connecting");
      socket.connect();
    };

    const handleOffline = () => {
      setOnline(false);
      setHealthStatus("unknown");
      setStatus("offline");
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [socket]);

  useEffect(() => {
    if (!online || (status !== "reconnecting" && status !== "failed")) {
      return;
    }

    const now = Date.now();
    if (now - lastProbeAtRef.current < HEALTH_PROBE_COOLDOWN_MS) {
      return;
    }

    lastProbeAtRef.current = now;

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), HEALTH_PROBE_TIMEOUT_MS);
    let cancelled = false;

    void (async () => {
      try {
        const response = await fetch(getHealthProbeUrl(), {
          method: "GET",
          cache: "no-store",
          credentials: "same-origin",
          headers: {
            Accept: "application/json",
          },
          signal: controller.signal,
        });

        if (cancelled) {
          return;
        }

        setHealthStatus(response.ok ? "reachable" : "unreachable");
      } catch {
        if (cancelled) {
          return;
        }

        setHealthStatus("unreachable");
      } finally {
        window.clearTimeout(timeoutId);
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [online, retryCount, status]);

  const retry = useCallback(() => {
    retryCountRef.current = 0;
    setRetryCount(0);
    setLastError(null);
    setHealthStatus("unknown");

    if (!onlineRef.current) {
      setStatus("offline");
      return;
    }

    setStatus(hasConnectedRef.current ? "reconnecting" : "connecting");
    socket.disconnect();
    socket.connect();
  }, [socket]);

  const enableCompatibilityMode = useCallback(() => {
    if (compatibilityMode) {
      retry();
      return;
    }

    setCompatibilityMode(true);
    retryCountRef.current = 0;
    setRetryCount(0);
    setLastError(null);
    setHealthStatus("unknown");
    setTransport("unknown");
    setStatus(onlineRef.current ? "connecting" : "offline");
    setSocket((currentSocket) => {
      currentSocket.disconnect();
      return createSocket({ compatibilityMode: true });
    });
  }, [compatibilityMode, retry]);

  const diagnostics = useMemo<ConnectionDiagnostics>(() => {
    return {
      status,
      compatibilityMode,
      transport,
      online,
      retryCount,
      lastError,
      lastConnectedAt,
      healthStatus,
      problem: classifyConnectionProblem({
        status,
        compatibilityMode,
        online,
        retryCount,
        lastError,
        healthStatus,
      }),
      endpoint: getRealtimeBaseUrl(),
      origin: getBrowserOrigin(),
    };
  }, [compatibilityMode, healthStatus, lastConnectedAt, lastError, online, retryCount, status, transport]);

  return {
    socket,
    status,
    compatibilityMode,
    diagnostics,
    retry,
    enableCompatibilityMode,
  };
}
