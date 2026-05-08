"use strict";

/**
 * Jazzer.js fuzz target for YASP utility functions.
 *
 * Run with:
 *   npx jazzer fuzz/fuzz-utils.js -- -max_total_time=60
 *
 * Exercises:
 *  - Room ID generation (character set, no bias via bitmask)
 *  - Vote-label numeric parsing used in computeStats
 */

// ── Inlined from server/src/utils/id.ts ─────────────────────────────────────
const CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CHARS_MASK = 0x1f;

function generateRoomId(bytes) {
  let id = "";
  for (let i = 0; i < bytes.length; i++) {
    id += CHARS[bytes[i] & CHARS_MASK];
  }
  return id;
}

// ── Inlined from server/src/domain/stats.ts ─────────────────────────────────
function isPlainNumericLabel(value) {
  const n = Number(value);
  return Number.isFinite(n) && String(n) === value;
}

function computeStats(votes, deckCards) {
  const values = Array.from(votes.values());
  if (values.length === 0) return;

  const distribution = {};
  for (const v of values) {
    distribution[v] = (distribution[v] || 0) + 1;
  }

  const numericValues = values.filter(isPlainNumericLabel).map(Number);
  const deckNumeric = deckCards.filter(isPlainNumericLabel).map(Number);

  if (numericValues.length > 0 && deckNumeric.length > 0) {
    const mean = numericValues.reduce((a, b) => a + b, 0) / numericValues.length;
    let nearest = deckNumeric[0];
    for (const c of deckNumeric.slice(1)) {
      if (Math.abs(c - mean) < Math.abs(nearest - mean)) nearest = c;
    }
  }
}

// ── Fuzzer entry point ───────────────────────────────────────────────────────
const VOTE_LABELS = ["1", "2", "3", "5", "8", "13", "21", "34", "?", "coffee", "∞"];
const DECK_PRESETS = [
  ["1", "2", "3", "5", "8", "13", "21"],
  ["XS", "S", "M", "L", "XL"],
  ["1", "2", "4", "8", "16"],
];

module.exports.fuzz = function (data) {
  if (data.length < 4) return;

  // 1. Fuzz room ID generation with arbitrary-length byte slices.
  const idLen = (data[0] & 0x3f) + 1; // 1–64
  const idBytes = data.slice(1, 1 + idLen);
  const roomId = generateRoomId(idBytes);

  // Every character must be in the allowed set.
  for (const ch of roomId) {
    if (!CHARS.includes(ch)) {
      throw new Error(`generateRoomId produced invalid char: ${JSON.stringify(ch)}`);
    }
  }
  if (roomId.length !== idBytes.length) {
    throw new Error("generateRoomId length mismatch");
  }

  // 2. Fuzz vote stats computation with derived vote maps and deck cards.
  const offset = 1 + idLen;
  if (offset >= data.length) return;

  const numVotes = data[offset] % 12; // 0–11 votes
  const deckPresetIdx = data[offset] >> 4;
  const deckCards = DECK_PRESETS[deckPresetIdx % DECK_PRESETS.length];

  const votes = new Map();
  for (let i = 0; i < numVotes && offset + 1 + i < data.length; i++) {
    const labelIdx = data[offset + 1 + i] % VOTE_LABELS.length;
    votes.set(`participant-${i}`, VOTE_LABELS[labelIdx]);
  }

  // Must not throw for any combination of valid-looking inputs.
  computeStats(votes, deckCards);
};
