import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, type Settings } from '@core/engine/settings.ts';
import { AudioService, cacheKey, dayKey, estimateChars, evictions, type AudioDeps, type DeviceVoice } from './service';
import { bodyFor, cloud, explain, ElevenError, listVoices } from './elevenlabs';

const blob = (n = 10) => new Blob([new Uint8Array(n)], { type: 'audio/mpeg' });

function rig(over: { audio?: Partial<Settings['audio']>; key?: boolean; online?: boolean; device?: boolean; synthFails?: boolean } = {}) {
  const log: string[] = [];
  const store = new Map<string, Blob>();
  let used = 0;
  const audio: Settings['audio'] = { ...DEFAULT_SETTINGS.audio, ...over.audio };
  const device: DeviceVoice = { available: over.device ?? true, speak: (t) => { log.push(`device:${t}`); }, stop: () => undefined };
  const deps: AudioDeps = {
    settings: () => audio,
    hasKey: () => over.key ?? false,
    online: () => over.online ?? true,
    device,
    cache: { get: async (k) => store.get(k), put: async (k, b) => { store.set(k, b); } },
    cloud: { synth: async (t, v, m) => { if (over.synthFails) throw new Error('boom'); log.push(`synth:${v}:${m}:${t}`); return blob(t.length); } },
    player: { play: async () => { log.push('play'); }, stop: () => undefined },
    usage: { get: () => used, add: (n) => { used += n; } },
  };
  return { svc: new AudioService(deps), log, store, used: () => used };
}
const eleven = { provider: 'elevenlabs' as const, voiceId: 'v1' };

describe('audio provider switching', () => {
  it('device is the default: no key, no network call', async () => {
    const r = rig();
    expect(await r.svc.speak('Guten Tag', 'w1')).toBe('device');
    expect(r.log).toEqual(['device:Guten Tag']);
  });
  it('elevenlabs without a key falls back to the device voice, silently', async () => {
    const r = rig({ audio: eleven, key: false });
    expect(await r.svc.speak('Hallo', 'w1')).toBe('device');
    expect(r.log.some((l) => l.startsWith('synth'))).toBe(false);
  });
  it('elevenlabs with key and voice: generates once, then plays from the cache', async () => {
    const r = rig({ audio: eleven, key: true });
    expect(await r.svc.speak('Hallo', 'w1')).toBe('cloud');
    expect(await r.svc.speak('Hallo', 'w1')).toBe('cache');
    expect(r.log.filter((l) => l.startsWith('synth'))).toHaveLength(1);
    expect(r.used()).toBe('Hallo'.length);
  });
  it('offline: cached audio still plays; uncached text falls back to the device voice', async () => {
    const online = rig({ audio: eleven, key: true });
    await online.svc.speak('Hallo', 'w1');
    const offline = rig({ audio: eleven, key: true, online: false });
    offline.store.set(cacheKey('elevenlabs', 'v1', '', 'Hallo'), blob());
    expect(await offline.svc.speak('Hallo', 'w1')).toBe('cache');
    expect(await offline.svc.speak('Anderes', 'w2')).toBe('device');
  });
  it('an error from the provider falls back to the device voice and the exercise goes on', async () => {
    const r = rig({ audio: eleven, key: true, synthFails: true });
    expect(await r.svc.speak('Hallo', 'w1')).toBe('device');
  });
  it('the daily character cap stops generating; the device voice speaks instead', async () => {
    const r = rig({ audio: { ...eleven, dailyCharCap: 8 }, key: true });
    expect(await r.svc.speak('Hallo', 'a')).toBe('cloud');
    expect(await r.svc.speak('Hallo Welt', 'b')).toBe('device');
  });
  it('no voice anywhere: nothing plays and nothing throws', async () => {
    const r = rig({ device: false });
    expect(await r.svc.speak('Hallo', 'w1')).toBe('none');
    expect(r.svc.canListen()).toBe(false);
  });
  it('listening is possible with a device voice, or with the cloud voice enabled', () => {
    expect(rig().svc.canListen()).toBe(true);
    expect(rig({ device: false, audio: eleven, key: true }).svc.canListen()).toBe(true);
    expect(rig({ device: false, audio: eleven, key: false }).svc.canListen()).toBe(false);
  });
  it('the cache is per provider, voice, model and exact text', () => {
    const k = (v: string, m: string, t: string) => cacheKey('elevenlabs', v, m, t);
    expect(k('a', '', 'Hallo')).toBe(k('a', '', ' Hallo '));
    expect(new Set([k('a', '', 'Hallo'), k('b', '', 'Hallo'), k('a', 'm2', 'Hallo'), k('a', '', 'Hallo!')]).size).toBe(4);
  });
  it('prefetch is opt-in, skips cached texts, and respects the cap', async () => {
    const off = rig({ audio: eleven, key: true });
    expect(await off.svc.prefetch(['Eins', 'Zwei'])).toEqual({ generated: 0, chars: 0 });
    const on = rig({ audio: { ...eleven, prefetch: true, dailyCharCap: 9 }, key: true });
    await on.svc.speak('Eins', 'x');
    expect(await on.svc.prefetch(['Eins', 'Zwei', 'Drei', 'Vier'])).toEqual({ generated: 1, chars: 4 });
  });
});

describe('audio cache bookkeeping', () => {
  it('evicts the oldest entries until the cache fits', () => {
    const idx = { a: { size: 40, t: 1 }, b: { size: 40, t: 2 }, c: { size: 40, t: 3 } };
    expect(evictions(idx, 120)).toEqual([]);
    expect(evictions(idx, 100)).toEqual(['a']);
    expect(evictions(idx, 50)).toEqual(['a', 'b']);
    expect(evictions(idx, 0)).toEqual(['a', 'b', 'c']);
  });
  it('estimates characters of what is not cached yet, once per text', () => {
    expect(estimateChars(['Eins', 'Eins', 'Zwei', ' '], new Set(['Zwei']))).toBe(4);
  });
  it('days roll over in UTC keys', () => {
    expect(dayKey(Date.parse('2026-10-09T23:59:00Z'))).toBe('2026-10-09');
    expect(dayKey(Date.parse('2026-10-10T00:00:01Z'))).toBe('2026-10-10');
  });
});

describe('ElevenLabs client', () => {
  const okJson = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

  it('sends the key only as the xi-api-key header, never in the URL or body', async () => {
    let seen: { url: string; headers: Record<string, string>; body: string } | null = null;
    const f = (async (url: string, init: RequestInit) => {
      seen = { url, headers: init.headers as Record<string, string>, body: String(init.body) };
      return new Response(blob(), { status: 200 });
    }) as unknown as typeof fetch;
    await cloud(() => 'SECRET-KEY', f).synth('Hallo', 'voice 1', '');
    expect(seen!.url.startsWith('https://api.elevenlabs.io/v1/text-to-speech/voice%201')).toBe(true);
    expect(seen!.url).not.toContain('SECRET-KEY');
    expect(seen!.body).not.toContain('SECRET-KEY');
    expect(seen!.headers['xi-api-key']).toBe('SECRET-KEY');
  });
  it('only the models documented to take language_code get it', () => {
    expect(bodyFor('Hallo', '')).toEqual({ text: 'Hallo' });
    expect(bodyFor('Hallo', 'eleven_multilingual_v2')).toEqual({ text: 'Hallo', model_id: 'eleven_multilingual_v2' });
    expect(bodyFor('Hallo', 'eleven_flash_v2_5')).toEqual({ text: 'Hallo', model_id: 'eleven_flash_v2_5', language_code: 'de' });
  });
  it('lists voices with German-verified ones first', async () => {
    const f = (async () => okJson({ voices: [
      { voice_id: 'b', name: 'Bea', verified_languages: [{ language: 'en' }] },
      { voice_id: 'a', name: 'Anna', verified_languages: [{ language: 'de' }] },
    ] })) as unknown as typeof fetch;
    expect((await listVoices('k', f)).map((v) => [v.id, v.german])).toEqual([['a', true], ['b', false]]);
  });
  it('maps failures to codes the UI translates; never the key', async () => {
    for (const [status, code] of [[401, 'bad_key'], [402, 'quota'], [429, 'rate'], [500, 'http']] as const) {
      const f = (async () => new Response('{}', { status })) as unknown as typeof fetch;
      const got = await cloud(() => 'SECRET-KEY', f).synth('x', 'v', '').then(() => '', explain);
      expect(got).toBe(code);
    }
    expect(explain(new TypeError('fetch failed'))).toBe('network');
    expect(explain(new ElevenError('quota'))).toBe('quota');
  });
  it('a network failure is an error, not a crash', async () => {
    const f = (async () => { throw new TypeError('offline'); }) as unknown as typeof fetch;
    await expect(cloud(() => 'k', f).synth('x', 'v', '')).rejects.toBeInstanceOf(ElevenError);
  });
});
