import { useEffect, useState } from "react";
import type { PongEvent } from "@yasp/shared";
import type { Socket } from "socket.io-client";

const CLOCK_SYNC_INTERVAL_MS = 20_000;

export function estimateServerClockOffset(sentAtMs: number, receivedAtMs: number, serverTs: number): number {
  return Math.round(serverTs - (sentAtMs + receivedAtMs) / 2);
}

export function useServerClockOffset(socket: Socket, enabled: boolean): number {
  const [offsetMs, setOffsetMs] = useState(0);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let cancelled = false;

    const syncOffset = () => {
      if (!socket.connected) {
        return;
      }

      const sentAtMs = Date.now();
      socket.emit("ping", { clientTs: sentAtMs }, (response: PongEvent) => {
        if (cancelled) {
          return;
        }

        const receivedAtMs = Date.now();
        setOffsetMs(estimateServerClockOffset(sentAtMs, receivedAtMs, response.serverTs));
      });
    };

    syncOffset();
    const intervalId = window.setInterval(syncOffset, CLOCK_SYNC_INTERVAL_MS);
    socket.on("connect", syncOffset);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      socket.off("connect", syncOffset);
    };
  }, [enabled, socket]);

  return offsetMs;
}
