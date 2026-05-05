import { randomBytes, randomUUID } from "node:crypto";

const CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateRoomId(length = 6): string {
  const bytes = randomBytes(length);
  let id = "";
  for (let i = 0; i < length; i++) {
    id += CHARS[bytes[i] % CHARS.length];
  }
  return id;
}

export function generateParticipantId(): string {
  return randomUUID();
}

export function generateStoryAgendaItemId(): string {
  return randomUUID();
}
