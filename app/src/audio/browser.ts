/**
 * The browser parts of the audio service: Cache Storage with a size limit, an <audio> player, the
 * on-device key store, the daily character counter. Everything is wrapped so a blocked storage only
 * means "no cache" or "no key", never a broken exercise.
 */
import { evictions, dayKey, AudioService, type BlobCache, type CacheIndex, type Player, type Usage } from './service';
import { cloud } from './elevenlabs';
import { speech } from './tts';
import type { Settings } from '@core/engine/settings.ts';

// ---------------------------------------------------------------- key (device only, never exported)

const KEY_NAME = 'strecke.audio.key';
export const keystore = {
  get(): string { try { return localStorage.getItem(KEY_NAME) ?? ''; } catch { return ''; } },
  set(k: string): boolean { try { localStorage.setItem(KEY_NAME, k.trim()); return true; } catch { return false; } },
  clear(): void { try { localStorage.removeItem(KEY_NAME); } catch { /* nothing to remove */ } },
  has(): boolean { return keystore.get().length > 0; },
};

// ---------------------------------------------------------------- cache

const CACHE = 'strecke-audio-v1';
const INDEX = 'strecke.audio.index';

function readIndex(): CacheIndex {
  try { return JSON.parse(localStorage.getItem(INDEX) ?? '{}') as CacheIndex; } catch { return {}; }
}
function writeIndex(i: CacheIndex): void {
  try { localStorage.setItem(INDEX, JSON.stringify(i)); } catch { /* index is a convenience */ }
}
const url = (k: string) => `${location.origin}/__audio/${k}`;

export const audioCache: BlobCache & {
  bytes(): number; count(): number; clear(): Promise<void>; trim(maxMB: number): Promise<void>; has(k: string): Promise<boolean>;
} = {
  async get(k) {
    if (typeof caches === 'undefined') return undefined;
    const hit = await (await caches.open(CACHE)).match(url(k));
    if (!hit) return undefined;
    const idx = readIndex();
    if (idx[k]) { idx[k] = { ...idx[k]!, t: Date.now() }; writeIndex(idx); }
    return hit.blob();
  },
  async put(k, blob) {
    if (typeof caches === 'undefined') return;
    await (await caches.open(CACHE)).put(url(k), new Response(blob, { headers: { 'Content-Type': blob.type || 'audio/mpeg' } }));
    const idx = readIndex();
    idx[k] = { size: blob.size, t: Date.now() };
    writeIndex(idx);
    await audioCache.trim(current?.cacheMaxMB ?? 50);
  },
  async has(k) { return !!(await audioCache.get(k)); },
  bytes: () => Object.values(readIndex()).reduce((n, e) => n + e.size, 0),
  count: () => Object.keys(readIndex()).length,
  async clear() {
    if (typeof caches !== 'undefined') await caches.delete(CACHE);
    writeIndex({});
  },
  async trim(maxMB) {
    if (typeof caches === 'undefined') return;
    const idx = readIndex();
    const drop = evictions(idx, maxMB * 1024 * 1024);
    if (!drop.length) return;
    const c = await caches.open(CACHE);
    for (const k of drop) { await c.delete(url(k)); delete idx[k]; }
    writeIndex(idx);
  },
};

// ---------------------------------------------------------------- player

let el: HTMLAudioElement | null = null;
let unlocked = false;
/** One shared element, unlocked inside a tap, so later playback of fetched audio is allowed on Android Chrome. */
export function unlockAudio(): void {
  if (unlocked || typeof Audio === 'undefined') return;
  unlocked = true;
  try {
    el ??= new Audio();
    el.src = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=';
    void el.play().catch(() => undefined);
  } catch { /* unlock is best-effort */ }
}

const player: Player = {
  play(blob) {
    return new Promise((resolve, reject) => {
      el ??= new Audio();
      const a = el;
      a.pause();
      const objectUrl = URL.createObjectURL(blob);
      const done = (ok: boolean) => { a.onended = a.onerror = null; URL.revokeObjectURL(objectUrl); ok ? resolve() : reject(new Error('play')); };
      a.onended = () => done(true);
      a.onerror = () => done(false);
      a.src = objectUrl;
      a.play().catch(() => done(false));
    });
  },
  stop() { try { el?.pause(); } catch { /* nothing playing */ } },
};

// ---------------------------------------------------------------- usage (characters generated today)

const USAGE = 'strecke.audio.usage';
const usage: Usage = {
  get() {
    try {
      const u = JSON.parse(localStorage.getItem(USAGE) ?? '{}') as { d?: string; n?: number };
      return u.d === dayKey(Date.now()) ? u.n ?? 0 : 0;
    } catch { return 0; }
  },
  add(chars) {
    try { localStorage.setItem(USAGE, JSON.stringify({ d: dayKey(Date.now()), n: usage.get() + chars })); } catch { /* counter is best-effort */ }
  },
};
export const charsToday = () => usage.get();

// ---------------------------------------------------------------- the service

let current: Settings['audio'];
export function setAudioSettings(a: Settings['audio']): void { current = a; }

export const audio = new AudioService({
  settings: () => current,
  hasKey: keystore.has,
  online: () => (typeof navigator === 'undefined' ? true : navigator.onLine),
  device: speech,
  cache: audioCache,
  cloud: cloud(keystore.get),
  player,
  usage,
});
