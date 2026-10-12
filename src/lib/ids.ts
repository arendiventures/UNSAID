import { randomBytes } from "node:crypto";

const ALPHABET = "0123456789abcdefghjkmnpqrstvwxyz"; // Crockford-ish, lowercase, no i/l/o/u

export function randomToken(length: number): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) out += ALPHABET[bytes[i]! % ALPHABET.length];
  return out;
}

/** Prefixed, URL-safe, human-readable identifiers (e.g. src_7kq2m9x3fd). */
export function newId(prefix: string, length = 10): string {
  return `${prefix}_${randomToken(length)}`;
}

/**
 * Stable passage ids derived from the owning source id and the passage sequence.
 * Once minted they are never renumbered, so citations stay valid.
 */
export function passageId(sourceId: string, seq: number): string {
  const core = sourceId.replace(/^src_/, "").slice(0, 8);
  return `psg_${core}_${String(seq).padStart(4, "0")}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}
