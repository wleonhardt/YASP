import { randomBytes, randomUUID } from "node:crypto";

// 32 chars = 2^5. 256 / 32 = 8 exactly, so every byte maps to an index
// with equal probability — no modulo bias, no rejection sampling needed.
const CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CHARS_MASK = 0x1f; // CHARS.length - 1

export function generateRoomId(length = 6): string {
  const bytes = randomBytes(length);
  let id = "";
  for (let i = 0; i < length; i++) {
    id += CHARS[bytes[i] & CHARS_MASK];
  }
  return id;
}

export function generateParticipantId(): string {
  return randomUUID();
}

export function generateStoryAgendaItemId(): string {
  return randomUUID();
}
