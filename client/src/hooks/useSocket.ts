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
import { getStoredCompatibilityModeEnabled, setStoredCompatibilityModeEnabled } from "../lib/storage";
import { createSocket, getHealthProbeUrl, getRealtimeBaseUrl } from "../lib/socket";

const FAILURE_RETRY_THRESHOLD = 2;
const HEALTH_PROBE_TIMEOUT_MS = 3_500;
const HEALTH_PROBE_COOLDOWN_MS = 10_000;
const INITIAL_CONNECTION_SETTLE_MS = 250;
const INITIAL_FAILURE_GRACE_MS = 1_000;

export type SocketConnectionState = {
  socket: Socket;
  status: ConnectionStatus;
  compatibilityMode: boolean;
  showRecoveryNotice: boolean;
  diagnostics: ConnectionDiagnostics;
  retry: () => void;
  enableCompatibilityMode: () => void;
  disableCompatibilityMode: () => void;
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
  const initialCompatibilityMode = getStoredCompatibilityModeEnabled();
  const [compatibilityMode, setCompatibilityMode] = useState(initialCompatibilityMode);
  const [socket, setSocket] = useState<Socket>(() =>
    createSocket({ compatibilityMode: initialCompatibilityMode })
  );
  const [hasResolvedInitialConnectionState, setHasResolvedInitialConnectionState] = useState(
    () => !getBrowserOnlineState()
  );
  const [status, setStatus] = useState<ConnectionStatus>(() =>
    getBrowserOnlineState() ? "connecting" : "offline"
  );
  const [showRecoveryNotice, setShowRecoveryNotice] = useState(() => !getBrowserOnlineState());
  const [transport, setTransport] = useState<ConnectionTransport>("unknown");
  const [online, setOnline] = useState(getBrowserOnlineState);
  const [retryCount, setRetryCount] = useState(0);
  const [lastError, setLastError] = useState<string | null>(null);
  const [lastConnectedAt, setLastConnectedAt] = useState<number | null>(null);
  const [healthStatus, setHealthStatus] = useState<HealthProbeStatus>("unknown");
  const [initialFailurePending, setInitialFailurePending] = useState(false);

  const hasConnectedRef = useRef(false);
  const retryCountRef = useRef(0);
  const lastProbeAtRef = useRef(0);
  const onlineRef = useRef(online);
  const hasResolvedInitialConnectionStateRef = useRef(hasResolvedInitialConnectionState);
  const initialConnectionTimerRef = useRef<number | null>(null);
  const initialFailureTimerRef = useRef<number | null>(null);
  const initialFailureStartedAtRef = useRef<number | null>(null);

  useEffect(() => {
    onlineRef.current = online;
  }, [online]);

  useEffect(() => {
    hasResolvedInitialConnectionStateRef.current = hasResolvedInitialConnectionState;
  }, [hasResolvedInitialConnectionState]);

  useEffect(() => {
    setStoredCompatibilityModeEnabled(compatibilityMode);
  }, [compatibilityMode]);

  const clearInitialConnectionTimer = useCallback(() => {
    if (initialConnectionTimerRef.current !== null) {
      globalThis.clearTimeout(initialConnectionTimerRef.current);
      initialConnectionTimerRef.current = null;
    }
  }, []);

  const clearInitialFailureTimer = useCallback(() => {
    if (initialFailureTimerRef.current !== null) {
      globalThis.clearTimeout(initialFailureTimerRef.current);
      initialFailureTimerRef.current = null;
    }
  }, []);

  const clearPendingInitialFailure = useCallback(() => {
    clearInitialFailureTimer();
    initialFailureStartedAtRef.current = null;
    setInitialFailurePending(false);
  }, [clearInitialFailureTimer]);

  const beginInitialFailurePending = useCallback(() => {
    if (initialFailureStartedAtRef.current === null) {
      initialFailureStartedAtRef.current = Date.now();
    }

    clearInitialFailureTimer();
    setInitialFailurePending(true);
  }, [clearInitialFailureTimer]);

  const resolveInitialConnectionState = useCallback(() => {
    clearInitialConnectionTimer();
    if (!hasResolvedInitialConnectionStateRef.current) {
      hasResolvedInitialConnectionStateRef.current = true;
      setHasResolvedInitialConnectionState(true);
    }
  }, [clearInitialConnectionTimer]);

  const resetInitialConnectionState = useCallback(() => {
    clearInitialConnectionTimer();
    hasResolvedInitialConnectionStateRef.current = false;
    setHasResolvedInitialConnectionState(false);
    clearPendingInitialFailure();
  }, [clearInitialConnectionTimer, clearPendingInitialFailure]);

  const scheduleInitialConnectionResolution = useCallback(() => {
    if (hasResolvedInitialConnectionStateRef.current) {
      return;
    }

    clearInitialConnectionTimer();
    initialConnectionTimerRef.current = globalThis.setTimeout(() => {
      hasResolvedInitialConnectionStateRef.current = true;
      setHasResolvedInitialConnectionState(true);
      initialConnectionTimerRef.current = null;
    }, INITIAL_CONNECTION_SETTLE_MS);
  }, [clearInitialConnectionTimer]);

  useEffect(() => {
    return () => {
      clearInitialConnectionTimer();
      clearInitialFailureTimer();
    };
  }, [clearInitialConnectionTimer, clearInitialFailureTimer]);

  const resolvePendingInitialFailure = useCallback(() => {
    clearInitialFailureTimer();

    if (socket.connected || !onlineRef.current || hasResolvedInitialConnectionStateRef.current) {
      return;
    }

    initialFailureStartedAtRef.current = null;
    setInitialFailurePending(false);
    resolveInitialConnectionState();
    setStatus("failed");
    setShowRecoveryNotice(true);
  }, [clearInitialFailureTimer, resolveInitialConnectionState, socket]);

  const schedulePendingInitialFailureResolution = useCallback(() => {
    if (!initialFailurePending || hasResolvedInitialConnectionStateRef.current) {
      return;
    }

    const startedAt = initialFailureStartedAtRef.current ?? Date.now();
    const elapsed = Date.now() - startedAt;
    const delay = Math.max(0, INITIAL_FAILURE_GRACE_MS - elapsed);

    clearInitialFailureTimer();
    initialFailureTimerRef.current = globalThis.setTimeout(() => {
      initialFailureTimerRef.current = null;
      resolvePendingInitialFailure();
    }, delay);
  }, [clearInitialFailureTimer, initialFailurePending, resolvePendingInitialFailure]);

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
      clearPendingInitialFailure();
      setStatus("connected");
      setShowRecoveryNotice(false);
      setLastConnectedAt(Date.now());
      bindEngineEvents();
      syncTransport();
      scheduleInitialConnectionResolution();
    };

    const handleDisconnect = (reason: string) => {
      clearInitialConnectionTimer();
      syncTransport();

      if (!onlineRef.current) {
        clearPendingInitialFailure();
        resolveInitialConnectionState();
        setStatus("offline");
        setHealthStatus("unknown");
        setShowRecoveryNotice(true);
        return;
      }

      if (reason === "io client disconnect") {
        return;
      }

      setHealthStatus("unknown");
      const nextStatus = hasResolvedInitialConnectionStateRef.current ? "reconnecting" : "connecting";
      setStatus(nextStatus);
      if (hasResolvedInitialConnectionStateRef.current) {
        setShowRecoveryNotice(true);
      }
    };

    const handleConnectError = (error: unknown) => {
      clearInitialConnectionTimer();
      setLastError(sanitizeConnectionError(error));
      setHealthStatus("unknown");
      syncTransport();

      if (!onlineRef.current) {
        clearPendingInitialFailure();
        resolveInitialConnectionState();
        setStatus("offline");
        setShowRecoveryNotice(true);
        return;
      }

      const nextStatus =
        retryCountRef.current > FAILURE_RETRY_THRESHOLD
          ? "failed"
          : hasResolvedInitialConnectionStateRef.current
            ? "reconnecting"
            : "connecting";

      if (!hasResolvedInitialConnectionStateRef.current && nextStatus === "failed") {
        beginInitialFailurePending();
        setStatus("connecting");
        setShowRecoveryNotice(false);
        return;
      }

      setStatus(nextStatus);
      if (nextStatus === "failed") {
        setShowRecoveryNotice(true);
      }
    };

    const handleReconnectAttempt = (attempt: number) => {
      retryCountRef.current = attempt;
      setRetryCount(attempt);
      setHealthStatus("unknown");
      const nextStatus = hasResolvedInitialConnectionStateRef.current ? "reconnecting" : "connecting";
      setStatus(nextStatus);
      if (hasResolvedInitialConnectionStateRef.current) {
        setShowRecoveryNotice(true);
      }
      syncTransport();
    };

    const handleReconnectError = (error: unknown) => {
      setLastError(sanitizeConnectionError(error));
    };

    const handleReconnectFailed = () => {
      clearInitialConnectionTimer();
      if (!onlineRef.current) {
        clearPendingInitialFailure();
        resolveInitialConnectionState();
        setStatus("offline");
        setShowRecoveryNotice(true);
        return;
      }

      clearPendingInitialFailure();
      resolveInitialConnectionState();
      setStatus("failed");
      setShowRecoveryNotice(true);
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
  }, [
    beginInitialFailurePending,
    clearInitialConnectionTimer,
    clearPendingInitialFailure,
    resolveInitialConnectionState,
    scheduleInitialConnectionResolution,
    socket,
  ]);

  useEffect(() => {
    if (!online) {
      clearPendingInitialFailure();
      resolveInitialConnectionState();
      setStatus("offline");
      setHealthStatus("unknown");
      setShowRecoveryNotice(true);
      socket.disconnect();
      return;
    }

    if (!socket.connected) {
      const nextStatus = hasResolvedInitialConnectionStateRef.current ? "reconnecting" : "connecting";
      setStatus(nextStatus);
      if (hasResolvedInitialConnectionStateRef.current) {
        setShowRecoveryNotice(true);
      } else {
        setShowRecoveryNotice(false);
      }
      socket.connect();
    }
  }, [clearPendingInitialFailure, online, resolveInitialConnectionState, socket]);

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
      clearPendingInitialFailure();
      if (hasConnectedRef.current && hasResolvedInitialConnectionStateRef.current) {
        setStatus("reconnecting");
        setShowRecoveryNotice(true);
      } else {
        resetInitialConnectionState();
        setStatus("connecting");
        setShowRecoveryNotice(false);
      }
      socket.connect();
    };

    const handleOffline = () => {
      setOnline(false);
      clearPendingInitialFailure();
      resolveInitialConnectionState();
      setHealthStatus("unknown");
      setStatus("offline");
      setShowRecoveryNotice(true);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [clearPendingInitialFailure, resetInitialConnectionState, resolveInitialConnectionState, socket]);

  useEffect(() => {
    if (!online || (!(status === "reconnecting" || status === "failed") && !initialFailurePending)) {
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
        if (initialFailurePending && !hasResolvedInitialConnectionStateRef.current && !socket.connected) {
          schedulePendingInitialFailureResolution();
        }
      } catch {
        if (cancelled) {
          return;
        }

        setHealthStatus("unreachable");
        if (initialFailurePending && !hasResolvedInitialConnectionStateRef.current && !socket.connected) {
          schedulePendingInitialFailureResolution();
        }
      } finally {
        globalThis.clearTimeout(timeoutId);
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
      globalThis.clearTimeout(timeoutId);
    };
  }, [initialFailurePending, online, retryCount, schedulePendingInitialFailureResolution, socket, status]);

  const retry = useCallback(() => {
    clearInitialConnectionTimer();
    clearPendingInitialFailure();
    retryCountRef.current = 0;
    setRetryCount(0);
    setLastError(null);
    setHealthStatus("unknown");

    if (!onlineRef.current) {
      setStatus("offline");
      setShowRecoveryNotice(true);
      return;
    }

    setStatus(hasConnectedRef.current ? "reconnecting" : "connecting");
    setShowRecoveryNotice(true);
    socket.disconnect();
    socket.connect();
  }, [clearInitialConnectionTimer, clearPendingInitialFailure, socket]);

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
    clearPendingInitialFailure();
    setTransport("unknown");
    setStatus(onlineRef.current ? "connecting" : "offline");
    setShowRecoveryNotice(true);
    setSocket((currentSocket) => {
      currentSocket.disconnect();
      return createSocket({ compatibilityMode: true });
    });
  }, [clearPendingInitialFailure, compatibilityMode, retry]);

  const disableCompatibilityMode = useCallback(() => {
    if (!compatibilityMode) {
      retry();
      return;
    }

    setCompatibilityMode(false);
    retryCountRef.current = 0;
    setRetryCount(0);
    setLastError(null);
    setHealthStatus("unknown");
    clearPendingInitialFailure();
    setTransport("unknown");
    setStatus(onlineRef.current ? "connecting" : "offline");
    setShowRecoveryNotice(true);
    setSocket((currentSocket) => {
      currentSocket.disconnect();
      return createSocket();
    });
  }, [clearPendingInitialFailure, compatibilityMode, retry]);

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
    showRecoveryNotice,
    diagnostics,
    retry,
    enableCompatibilityMode,
    disableCompatibilityMode,
  };
}
