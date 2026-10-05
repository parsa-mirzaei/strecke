/**
 * IDs are minted by the writer (importer or app), never taken from AI output, and never change.
 * Randomness is injected so the browser (crypto.getRandomValues), Apps Script (Utilities.getUuid)
 * and tests (seeded) can share the same code.
 */
export type RandomBytes = (n: number) => Uint8Array;

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

export function mintId(prefix: 'w' | 'p' | 'e' | 'c', taken: ReadonlySet<string>, randomBytes: RandomBytes): string {
  for (let attempt = 0; attempt < 8; attempt++) {
    // 252 = 7 * 36: drop bytes above it so every character is equally likely.
    let body = '';
    while (body.length < 8) {
      for (const b of randomBytes(16)) {
        if (b < 252 && body.length < 8) body += ALPHABET[b % 36];
      }
    }
    const id = `${prefix}_${body}`;
    if (!taken.has(id)) return id;
  }
  throw new Error('id_space_exhausted');
}

/** Deterministic generator for tests and reproducible evidence runs (xorshift32). Not for production. */
export function seededBytes(seed: number): RandomBytes {
  let x = seed >>> 0 || 1;
  return (n) => {
    const out = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0;
      out[i] = x & 0xff;
    }
    return out;
  };
}
