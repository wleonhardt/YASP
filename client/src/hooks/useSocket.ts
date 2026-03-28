import { useEffect, useState, useRef } from "react";
import { getSocket } from "../lib/socket";
import type { Socket } from "socket.io-client";

export type ConnectionStatus = "connecting" | "connected" | "disconnected";

export function useSocket() {
  const socketRef = useRef<Socket>(getSocket());
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");

  useEffect(() => {
    const socket = socketRef.current;

    const onConnect = () => setStatus("connected");
    const onDisconnect = () => setStatus("disconnected");
    const onConnectError = () => setStatus("disconnected");

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("connect_error", onConnectError);

    if (!socket.connected) {
      setStatus("connecting");
      socket.connect();
    } else {
      setStatus("connected");
    }

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("connect_error", onConnectError);
    };
  }, []);

  return { socket: socketRef.current, status };
}
