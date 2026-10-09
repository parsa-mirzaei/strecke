/**
 * Audio behind one interface: `speak(text, key)`.
 *
 *   device      Web Speech, de-DE. Default, zero setup, works offline.
 *   elevenlabs  The learner's own API key, kept on this device only. Audio is generated once per
 *               (provider, voice, model, text), cached in Cache Storage up to a size limit, and played
 *               from the cache afterwards, also offline.
 *
 * Whatever goes wrong with the cloud voice (no key, offline, quota, error, daily cap reached) falls back
 * to the device voice without telling the exercise: it still plays, or silently does not.
 * The service is built from injected parts so provider switching is tested without a browser.
 */
import { sha256 } from '@core/sha256.ts';
import type { Settings } from '@core/engine/settings.ts';

export type Played = 'cache' | 'cloud' | 'device' | 'none';

export interface DeviceVoice {
  readonly available: boolean;
  speak(text: string, opts?: { rate?: number; onEnd?: () => void }): void;
  stop(): void;
}

export interface BlobCache {
  get(key: string): Promise<Blob | undefined>;
  put(key: string, blob: Blob): Promise<void>;
}

export interface CloudVoice {
  synth(text: string, voiceId: string, modelId: string): Promise<Blob>;
}

export interface Player {
  /** Plays until the end; rejects when the browser refuses. */
  play(blob: Blob): Promise<void>;
  stop(): void;
}

export interface Usage { get(): number; add(chars: number): void }

export interface AudioDeps {
  settings: () => Settings['audio'];
  hasKey: () => boolean;
  online: () => boolean;
  device: DeviceVoice;
  cache: BlobCache;
  cloud: CloudVoice;
  player: Player;
  usage: Usage;
}

/** Cache key: provider, voice, model and the exact text. */
export function cacheKey(provider: string, voiceId: string, modelId: string, text: string): string {
  return `${provider}/${voiceId || 'default'}/${modelId || 'default'}/${sha256(text.trim())}`;
}

export class AudioService {
  constructor(private d: AudioDeps) {}

  /** Can something speak German right now? Used to decide whether Hören is part of a run. */
  canListen(): boolean {
    const a = this.d.settings();
    return this.d.device.available || (a.provider === 'elevenlabs' && this.d.hasKey());
  }

  private cloudReady(): boolean {
    const a = this.d.settings();
    return a.provider === 'elevenlabs' && this.d.hasKey() && !!a.voiceId;
  }

  stop(): void {
    this.d.player.stop();
    this.d.device.stop();
  }

  /** Speak `text`. `key` names the thing being spoken (for example a word id); it is not part of the cache key. */
  async speak(text: string, _key = '', opts: { rate?: number; onEnd?: () => void } = {}): Promise<Played> {
    this.stop();
    const a = this.d.settings();
    if (this.cloudReady()) {
      const k = cacheKey('elevenlabs', a.voiceId, a.modelId, text);
      try {
        const hit = await this.d.cache.get(k);
        if (hit) {
          await this.d.player.play(hit);
          opts.onEnd?.();
          return 'cache';
        }
        if (this.d.online() && this.d.usage.get() + text.length <= a.dailyCharCap) {
          const blob = await this.d.cloud.synth(text, a.voiceId, a.modelId);
          this.d.usage.add(text.length);
          await this.d.cache.put(k, blob).catch(() => undefined);
          await this.d.player.play(blob);
          opts.onEnd?.();
          return 'cloud';
        }
      } catch {
        /* fall through to the device voice */
      }
    }
    if (this.d.device.available) {
      this.d.device.speak(text, opts);
      return 'device';
    }
    opts.onEnd?.();
    return 'none';
  }

  /**
   * Generate audio for upcoming texts while online (opt-in). Stops at the first failure or when the daily
   * cap would be exceeded. Returns how many were newly generated and how many characters they cost.
   */
  async prefetch(texts: readonly string[]): Promise<{ generated: number; chars: number }> {
    const a = this.d.settings();
    let generated = 0, chars = 0;
    if (!a.prefetch || !this.cloudReady()) return { generated, chars };
    for (const text of [...new Set(texts.map((t) => t.trim()).filter(Boolean))]) {
      if (!this.d.online()) break;
      const k = cacheKey('elevenlabs', a.voiceId, a.modelId, text);
      if (await this.d.cache.get(k).catch(() => undefined)) continue;
      if (this.d.usage.get() + text.length > a.dailyCharCap) break;
      try {
        const blob = await this.d.cloud.synth(text, a.voiceId, a.modelId);
        this.d.usage.add(text.length);
        await this.d.cache.put(k, blob);
        generated++;
        chars += text.length;
      } catch {
        break;
      }
    }
    return { generated, chars };
  }
}

// ---------------------------------------------------------------- pure helpers (tested)

export interface IndexEntry { size: number; t: number }
export type CacheIndex = Record<string, IndexEntry>;

/** Keys to delete (oldest first) so the cache fits `maxBytes`. */
export function evictions(index: CacheIndex, maxBytes: number): string[] {
  let total = Object.values(index).reduce((n, e) => n + e.size, 0);
  const out: string[] = [];
  for (const [k, e] of Object.entries(index).sort((a, b) => a[1].t - b[1].t)) {
    if (total <= maxBytes) break;
    out.push(k);
    total -= e.size;
  }
  return out;
}

export const dayKey = (now: number) => new Date(now).toISOString().slice(0, 10);

/** Characters the next cards would cost if none of them is cached yet. */
export function estimateChars(texts: readonly string[], cached: ReadonlySet<string>): number {
  return [...new Set(texts.map((t) => t.trim()).filter(Boolean))].filter((t) => !cached.has(t)).reduce((n, t) => n + t.length, 0);
}
