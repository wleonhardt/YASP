import { useCallback, useEffect, useState } from "react";
import { getStoredTimerSoundEnabled, setStoredTimerSoundEnabled } from "../lib/storage";

const TIMER_SOUND_CHANGE_EVENT = "yasp:timer-sound-preference-changed";

function notifyTimerSoundPreferenceChanged(): void {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new Event(TIMER_SOUND_CHANGE_EVENT));
}

export function useTimerSoundPreference(): readonly [boolean, (enabled: boolean) => void] {
  const [enabled, setEnabled] = useState(getStoredTimerSoundEnabled);

  useEffect(() => {
    const syncPreference = () => setEnabled(getStoredTimerSoundEnabled());

    window.addEventListener(TIMER_SOUND_CHANGE_EVENT, syncPreference);
    window.addEventListener("storage", syncPreference);
    return () => {
      window.removeEventListener(TIMER_SOUND_CHANGE_EVENT, syncPreference);
      window.removeEventListener("storage", syncPreference);
    };
  }, []);

  const setPreference = useCallback((nextEnabled: boolean) => {
    setStoredTimerSoundEnabled(nextEnabled);
    setEnabled(nextEnabled);
    notifyTimerSoundPreferenceChanged();
  }, []);

  return [enabled, setPreference] as const;
}
