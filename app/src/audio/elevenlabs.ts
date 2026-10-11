/**
 * ElevenLabs client, called straight from the browser with the learner's own key.
 * Facts checked against the official docs on 2026-10-09 (also listed in docs/design/DECISIONS.md):
 *   - TTS:    POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}?output_format=…, header `xi-api-key`,
 *             JSON body { text, model_id?, language_code? }, binary audio response.
 *             https://elevenlabs.io/docs/api-reference/text-to-speech/convert
 *   - Voices: GET https://api.elevenlabs.io/v2/voices?page_size=…, same header.
 *             https://elevenlabs.io/docs/api-reference/voices/search
 *   - Models: GET https://api.elevenlabs.io/v1/models (needs the key), fields model_id, name, can_do_text_to_speech, languages.
 *             https://elevenlabs.io/docs/api-reference/models/list
 *   - CORS:   the API answers preflight with access-control-allow-origin: * and allow-headers: *
 *             (observed 2026-10-09), so a static page can call it directly.
 * The key goes only into the `xi-api-key` header of requests to api.elevenlabs.io. It is never logged,
 * never put in a URL, and never echoed into an error message.
 */
import type { CloudVoice } from './service';

export const API = 'https://api.elevenlabs.io';

export interface VoiceInfo { id: string; name: string; german: boolean; preview?: string }
export interface ModelInfo { id: string; name: string }

export class ElevenError extends Error {
  constructor(readonly code: 'bad_key' | 'quota' | 'rate' | 'network' | 'http', readonly status = 0) {
    super(code);
  }
}

/** Why a request failed, as a code the UI translates (`audio.err.<code>`). Never contains the key. */
export function explain(e: unknown): ElevenError['code'] {
  return e instanceof ElevenError ? e.code : 'network';
}

type Fetch = typeof fetch;

async function call(f: Fetch, key: string, path: string, init: RequestInit = {}): Promise<Response> {
  let res: Response;
  try {
    res = await f(`${API}${path}`, { ...init, headers: { 'xi-api-key': key, ...(init.headers ?? {}) } });
  } catch {
    throw new ElevenError('network');
  }
  if (res.ok) return res;
  if (res.status === 401) throw new ElevenError('bad_key', 401);
  if (res.status === 402) throw new ElevenError('quota', 402);
  if (res.status === 429) throw new ElevenError('rate', 429);
  throw new ElevenError('http', res.status);
}

export async function listVoices(key: string, f: Fetch = fetch): Promise<VoiceInfo[]> {
  const res = await call(f, key, '/v2/voices?page_size=100');
  const data = (await res.json()) as { voices?: Array<{ voice_id?: string; name?: string; preview_url?: string; verified_languages?: Array<{ language?: string; locale?: string }> }> };
  const out = (data.voices ?? [])
    .filter((v) => v.voice_id && v.name)
    .map((v) => ({
      id: v.voice_id!, name: v.name!, preview: v.preview_url,
      german: (v.verified_languages ?? []).some((l) => (l.language ?? l.locale ?? '').toLowerCase().startsWith('de')),
    }));
  return out.sort((a, b) => Number(b.german) - Number(a.german) || a.name.localeCompare(b.name));
}

export async function listModels(key: string, f: Fetch = fetch): Promise<ModelInfo[]> {
  const res = await call(f, key, '/v1/models');
  const data = (await res.json()) as Array<{ model_id?: string; name?: string; can_do_text_to_speech?: boolean; languages?: Array<{ language_id?: string }> }>;
  return (Array.isArray(data) ? data : [])
    .filter((m) => m.model_id && m.can_do_text_to_speech && (m.languages ?? []).some((l) => l.language_id === 'de'))
    .map((m) => ({ id: m.model_id!, name: m.name ?? m.model_id! }));
}

/** `language_code` is only sent for models documented to take it; the default model does not. */
export function bodyFor(text: string, modelId: string): Record<string, string> {
  const body: Record<string, string> = { text };
  if (modelId) body.model_id = modelId;
  if (/flash_v2_5|turbo_v2_5|v3/.test(modelId)) body.language_code = 'de';
  return body;
}

export function cloud(getKey: () => string, f: Fetch = fetch): CloudVoice {
  return {
    async synth(text, voiceId, modelId) {
      const key = getKey();
      if (!key) throw new ElevenError('bad_key');
      const res = await call(f, key, `/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_64`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
        body: JSON.stringify(bodyFor(text, modelId)),
      });
      return res.blob();
    },
  };
}
