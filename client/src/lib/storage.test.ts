import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getStoredTimerSoundEnabled, setStoredTimerSoundEnabled } from "./storage";

describe("timer sound storage", () => {
  let values: Map<string, string>;

  beforeEach(() => {
    values = new Map();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
      clear: () => {
        values.clear();
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("defaults to on for fresh users", () => {
    expect(getStoredTimerSoundEnabled()).toBe(true);
  });

  it("preserves an explicit off preference", () => {
    setStoredTimerSoundEnabled(false);
    expect(getStoredTimerSoundEnabled()).toBe(false);
  });

  it("preserves an explicit on preference", () => {
    setStoredTimerSoundEnabled(true);
    expect(getStoredTimerSoundEnabled()).toBe(true);
  });
});
