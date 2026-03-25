import { useMemo } from "react";
import { getSessionId, getStoredDisplayName } from "../lib/storage";

export function useSession() {
  const sessionId = useMemo(() => getSessionId(), []);
  const storedName = getStoredDisplayName();

  return { sessionId, storedName };
}
