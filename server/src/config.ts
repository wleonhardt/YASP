export const PORT = parseInt(process.env.PORT || "3001", 10);
export const HOST = process.env.HOST || "0.0.0.0";

export const ROOM_TTL_MS = 12 * 60 * 60 * 1000;
export const DISCONNECTED_PARTICIPANT_GRACE_MS = 30 * 60 * 1000;
export const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
