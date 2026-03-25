const CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateRoomId(length = 6): string {
  let id = "";
  for (let i = 0; i < length; i++) {
    id += CHARS[Math.floor(Math.random() * CHARS.length)];
  }
  return id;
}
