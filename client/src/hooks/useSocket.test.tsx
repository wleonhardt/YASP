import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Socket } from "socket.io-client";
import { useSocket } from "./useSocket";

type Listener = (...args: unknown[]) => void;

type FakeEngine = {
  transport: { name: string };
  on: ReturnType<typeof vi.fn>;
  off: ReturnType<typeof vi.fn>;
  emit: (event: string, ...args: unknown[]) => void;
};

type FakeSocket = Socket & {
  connected: boolean;
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  io: {
    engine: FakeEngine;
    on: ReturnType<typeof vi.fn>;
    off: ReturnType<typeof vi.fn>;
  };
  emitSocketEvent: (event: string, ...args: unknown[]) => void;
  emitManagerEvent: (event: string, ...args: unknown[]) => void;
};

const mocks = vi.hoisted(() => ({
  io: vi.fn(),
  createdSockets: [] as FakeSocket[],
}));

vi.mock("socket.io-client", () => ({
  io: mocks.io,
}));

function createEmitter() {
  const listeners = new Map<string, Set<Listener>>();

  return {
    on: vi.fn((event: string, listener: Listener) => {
      const current = listeners.get(event) ?? new Set<Listener>();
      current.add(listener);
      listeners.set(event, current);
      return undefined;
    }),
    off: vi.fn((event: string, listener: Listener) => {
      listeners.get(event)?.delete(listener);
      return undefined;
    }),
    emit(event: string, ...args: unknown[]) {
      for (const listener of listeners.get(event) ?? []) {
        listener(...args);
      }
    },
  };
}

function createFakeSocket(): FakeSocket {
  const socketEmitter = createEmitter();
  const managerEmitter = createEmitter();
  const engineEmitter = createEmitter();

  const engine: FakeEngine = {
    transport: { name: "polling" },
    on: engineEmitter.on,
    off: engineEmitter.off,
    emit: engineEmitter.emit,
  };

  const socket = {
    connected: false,
    connect: vi.fn(() => {
      socket.connected = true;
      return socket;
    }),
    disconnect: vi.fn(() => {
      socket.connected = false;
      return socket;
    }),
    on: vi.fn((event: string, listener: Listener) => {
      socketEmitter.on(event, listener);
      return socket;
    }),
    off: vi.fn((event: string, listener: Listener) => {
      socketEmitter.off(event, listener);
      return socket;
    }),
    io: {
      engine,
      on: vi.fn((event: string, listener: Listener) => {
        managerEmitter.on(event, listener);
        return undefined;
      }),
      off: vi.fn((event: string, listener: Listener) => {
        managerEmitter.off(event, listener);
        return undefined;
      }),
    },
    emitSocketEvent(event: string, ...args: unknown[]) {
      if (event === "connect") {
        socket.connected = true;
      }

      if (event === "disconnect") {
        socket.connected = false;
      }

      socketEmitter.emit(event, ...args);
    },
    emitManagerEvent(event: string, ...args: unknown[]) {
      managerEmitter.emit(event, ...args);
    },
  };

  return socket as unknown as FakeSocket;
}

describe("useSocket", () => {
  beforeEach(() => {
    mocks.io.mockReset();
    mocks.createdSockets.length = 0;
    mocks.io.mockImplementation(() => {
      const socket = createFakeSocket();
      mocks.createdSockets.push(socket);
      return socket;
    });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      )
    );

    Object.defineProperty(window.navigator, "onLine", {
      configurable: true,
      value: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps the default transport strategy on the happy path", async () => {
    const { result } = renderHook(() => useSocket());
    const socket = mocks.createdSockets[0];

    expect(mocks.io).toHaveBeenNthCalledWith(
      1,
      "http://localhost:3001",
      expect.objectContaining({
        autoConnect: false,
        transports: ["websocket", "polling"],
        upgrade: true,
      })
    );

    act(() => {
      socket.io.engine.transport.name = "websocket";
      socket.emitSocketEvent("connect");
    });

    await waitFor(() => {
      expect(result.current.status).toBe("connected");
    });

    expect(result.current.compatibilityMode).toBe(false);
    expect(result.current.showRecoveryNotice).toBe(false);
    expect(result.current.diagnostics.transport).toBe("websocket");
  });

  it("keeps the initial bootstrap quiet until there is a real recovery failure", async () => {
    const { result } = renderHook(() => useSocket());
    const socket = mocks.createdSockets[0];

    expect(result.current.status).toBe("connecting");
    expect(result.current.showRecoveryNotice).toBe(false);

    act(() => {
      socket.emitManagerEvent("reconnect_attempt", 3);
      socket.emitSocketEvent("connect_error", new Error("xhr poll error"));
    });

    expect(result.current.status).toBe("connecting");
    expect(result.current.showRecoveryNotice).toBe(false);

    act(() => {
      socket.emitManagerEvent("reconnect_failed");
    });

    expect(result.current.status).toBe("failed");
    expect(result.current.showRecoveryNotice).toBe(true);
  });

  it("retries the active socket on demand", () => {
    const { result } = renderHook(() => useSocket());
    const socket = mocks.createdSockets[0];

    socket.connect.mockClear();
    socket.disconnect.mockClear();

    act(() => {
      result.current.retry();
    });

    expect(socket.disconnect).toHaveBeenCalledTimes(1);
    expect(socket.connect).toHaveBeenCalledTimes(1);
  });

  it("recreates the socket in polling-only compatibility mode when requested", async () => {
    const { result } = renderHook(() => useSocket());
    const initialSocket = mocks.createdSockets[0];

    act(() => {
      result.current.enableCompatibilityMode();
    });

    await waitFor(() => {
      expect(result.current.compatibilityMode).toBe(true);
      expect(mocks.createdSockets).toHaveLength(2);
    });

    expect(initialSocket.disconnect).toHaveBeenCalled();
    expect(window.sessionStorage.getItem("yasp.compatibilityMode")).toBe("1");
    expect(mocks.io).toHaveBeenNthCalledWith(
      2,
      "http://localhost:3001",
      expect.objectContaining({
        autoConnect: false,
        transports: ["polling"],
        upgrade: false,
      })
    );
  });

  it("reuses compatibility mode for the rest of the current browser session", async () => {
    const { result, unmount } = renderHook(() => useSocket());

    act(() => {
      result.current.enableCompatibilityMode();
    });

    await waitFor(() => {
      expect(window.sessionStorage.getItem("yasp.compatibilityMode")).toBe("1");
      expect(result.current.compatibilityMode).toBe(true);
    });

    unmount();

    const initialSocketCount = mocks.createdSockets.length;
    const { result: remountedResult } = renderHook(() => useSocket());

    expect(mocks.createdSockets).toHaveLength(initialSocketCount + 1);
    expect(remountedResult.current.compatibilityMode).toBe(true);
    expect(remountedResult.current.showRecoveryNotice).toBe(false);
    expect(mocks.io).toHaveBeenLastCalledWith(
      "http://localhost:3001",
      expect.objectContaining({
        autoConnect: false,
        transports: ["polling"],
        upgrade: false,
      })
    );
  });

  it("keeps refresh bootstrap quiet when compatibility mode is already enabled for the session", async () => {
    vi.useFakeTimers();
    window.sessionStorage.setItem("yasp.compatibilityMode", "1");

    const { result } = renderHook(() => useSocket());
    const socket = mocks.createdSockets[0];

    expect(result.current.compatibilityMode).toBe(true);
    expect(result.current.status).toBe("connecting");
    expect(result.current.showRecoveryNotice).toBe(false);

    act(() => {
      socket.emitManagerEvent("reconnect_attempt", 3);
      socket.emitSocketEvent("connect_error", new Error("xhr poll error"));
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.status).toBe("connecting");
    expect(result.current.showRecoveryNotice).toBe(false);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(900);
    });

    expect(result.current.showRecoveryNotice).toBe(false);

    act(() => {
      socket.io.engine.transport.name = "polling";
      socket.emitSocketEvent("connect");
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
      await Promise.resolve();
    });

    expect(result.current.status).toBe("connected");
    expect(result.current.showRecoveryNotice).toBe(false);
    expect(result.current.diagnostics.transport).toBe("polling");
  });

  it("can clear the compatibility preference and rebuild the default socket transport", async () => {
    window.sessionStorage.setItem("yasp.compatibilityMode", "1");

    const { result } = renderHook(() => useSocket());
    const compatibilitySocket = mocks.createdSockets[0];

    expect(result.current.compatibilityMode).toBe(true);

    act(() => {
      result.current.disableCompatibilityMode();
    });

    await waitFor(() => {
      expect(result.current.compatibilityMode).toBe(false);
      expect(window.sessionStorage.getItem("yasp.compatibilityMode")).toBeNull();
      expect(mocks.createdSockets).toHaveLength(2);
    });

    expect(compatibilitySocket.disconnect).toHaveBeenCalled();
    expect(mocks.io).toHaveBeenNthCalledWith(
      2,
      "http://localhost:3001",
      expect.objectContaining({
        autoConnect: false,
        transports: ["websocket", "polling"],
        upgrade: true,
      })
    );
  });

  it("distinguishes a reachable backend from blocked realtime transport failures", async () => {
    const fetchMock = vi.mocked(fetch);
    const { result } = renderHook(() => useSocket());
    const socket = mocks.createdSockets[0];

    act(() => {
      socket.emitManagerEvent("reconnect_attempt", 3);
      socket.emitSocketEvent("connect_error", new Error("xhr poll error"));
      socket.emitManagerEvent("reconnect_failed");
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "http://localhost:3001/api/health",
        expect.objectContaining({
          method: "GET",
          cache: "no-store",
          credentials: "same-origin",
        })
      );
    });

    await waitFor(() => {
      expect(result.current.status).toBe("failed");
      expect(result.current.showRecoveryNotice).toBe(true);
      expect(result.current.diagnostics.healthStatus).toBe("reachable");
      expect(result.current.diagnostics.problem).toBe("realtime_blocked");
      expect(result.current.diagnostics.retryCount).toBe(3);
    });
  });
});
