import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getStoredTimerSoundEnabled, setStoredTimerSoundEnabled } from "./storage";

describe("timer sound storage", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
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
