import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { AckResult } from "@yasp/shared";
import type { Socket } from "socket.io-client";
import { useRoom } from "./useRoom";

type Listener = (...args: unknown[]) => void;
type AckCallback<T> = (result: AckResult<T>) => void;

function createSocketMock(): Socket {
  const listeners = new Map<string, Set<Listener>>();

  const socket: {
    on: unknown;
    off: unknown;
    emit: unknown;
  } = {
    on: vi.fn((event: string, listener: Listener) => {
      const current = listeners.get(event) ?? new Set<Listener>();
      current.add(listener);
      listeners.set(event, current);
      return socket;
    }),
    off: vi.fn((event: string, listener: Listener) => {
      listeners.get(event)?.delete(listener);
      return socket;
    }),
    emit: vi.fn(<T,>(event: string, payload: unknown, callback?: AckCallback<T>) => {
      callback?.({ ok: true, data: undefined as T });
      return socket;
    }),
  };

  return socket as unknown as Socket;
}

describe("useRoom", () => {
  it("emits update_settings with the expected payload", async () => {
    const socket = createSocketMock();
    const { result } = renderHook(() => useRoom(socket, "session-1"));

    let ack: AckResult | null = null;
    await act(async () => {
      ack = await result.current.updateSettings("ROOM01", {
        revealPolicy: "anyone",
        allowSpectators: false,
      });
    });

    expect(socket.emit).toHaveBeenCalledWith(
      "update_settings",
      {
        roomId: "ROOM01",
        settings: {
          revealPolicy: "anyone",
          allowSpectators: false,
        },
      },
      expect.any(Function)
    );
    expect(ack).toEqual({ ok: true, data: undefined });
  });

  it("emits reopen_voting with the expected payload", async () => {
    const socket = createSocketMock();
    const { result } = renderHook(() => useRoom(socket, "session-1"));

    let ack: AckResult | null = null;
    await act(async () => {
      ack = await result.current.reopenVoting("ROOM01");
    });

    expect(socket.emit).toHaveBeenCalledWith(
      "reopen_voting",
      {
        roomId: "ROOM01",
      },
      expect.any(Function)
    );
    expect(ack).toEqual({ ok: true, data: undefined });
  });

  it("emits story agenda events with the expected payloads", async () => {
    const socket = createSocketMock();
    const { result } = renderHook(() => useRoom(socket, "session-1"));

    await act(async () => {
      await result.current.updateStoryLabel("ROOM01", "Checkout total");
      await result.current.addStoryAgendaItems("ROOM01", ["Discount code", "Guest checkout"]);
      await result.current.moveStoryAgendaItem("ROOM01", "story-2", "up");
      await result.current.removeStoryAgendaItem("ROOM01", "story-1");
      await result.current.startNextStory("ROOM01");
    });

    expect(socket.emit).toHaveBeenCalledWith(
      "update_story_label",
      { roomId: "ROOM01", label: "Checkout total" },
      expect.any(Function)
    );
    expect(socket.emit).toHaveBeenCalledWith(
      "add_story_agenda_items",
      { roomId: "ROOM01", labels: ["Discount code", "Guest checkout"] },
      expect.any(Function)
    );
    expect(socket.emit).toHaveBeenCalledWith(
      "move_story_agenda_item",
      { roomId: "ROOM01", itemId: "story-2", direction: "up" },
      expect.any(Function)
    );
    expect(socket.emit).toHaveBeenCalledWith(
      "remove_story_agenda_item",
      { roomId: "ROOM01", itemId: "story-1" },
      expect.any(Function)
    );
    expect(socket.emit).toHaveBeenCalledWith("start_next_story", { roomId: "ROOM01" }, expect.any(Function));
  });
});
