/**
 * Settings the learner can change (ENGINE.md, DECISIONS in design/DECISIONS.md). Pure: parsing,
 * defaults, clamping and the export/import envelope live here so they are tested without a browser.
 *
 * Secrets never live here. The audio provider's API key is stored on its own, on the device only,
 * and is not part of `Settings` or of any export.
 */
import { EXERCISE_TYPES, type ExerciseType } from '../exercises.ts';

export const THEMES = ['system', 'light', 'dark'] as const;
export type Theme = (typeof THEMES)[number];
export const AUDIO_PROVIDERS = ['device', 'elevenlabs'] as const;
export type AudioProviderId = (typeof AUDIO_PROVIDERS)[number];

export interface Settings {
  version: 1;
  /** Exercise types switched off. Karte cannot be switched off: a new word needs it. */
  disabled: ExerciseType[];
  newPerRun: number;
  runLength: number;
  /** Minutes of inactivity after which the next card starts a new run. */
  runGapMin: number;
  theme: Theme;
  haptics: boolean;
  goal: { enabled: boolean; runsPerWeek: number };
  audio: {
    provider: AudioProviderId;
    /** ElevenLabs voice and model; empty means "first suitable / provider default". */
    voiceId: string;
    modelId: string;
    /** Generate audio for upcoming cards while online. Off by default: it costs characters. */
    prefetch: boolean;
    /** Stop generating after this many characters per day (0 = no generating at all beyond the card on screen). */
    dailyCharCap: number;
    cacheMaxMB: number;
  };
}

export const DEFAULT_SETTINGS: Settings = {
  version: 1,
  disabled: [],
  newPerRun: 2,
  runLength: 6,
  runGapMin: 20,
  theme: 'system',
  haptics: true,
  goal: { enabled: false, runsPerWeek: 5 },
  audio: { provider: 'device', voiceId: '', modelId: '', prefetch: false, dailyCharCap: 2000, cacheMaxMB: 50 },
};

export const LIMITS = {
  newPerRun: [0, 6],
  runLength: [3, 12],
  runGapMin: [5, 120],
  runsPerWeek: [1, 21],
  dailyCharCap: [0, 20000],
  cacheMaxMB: [5, 200],
} as const;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function int(v: unknown, [lo, hi]: readonly [number, number], d: number): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : d;
}

const oneOf = <T extends string>(list: readonly T[], v: unknown, d: T): T => (list.includes(v as T) ? (v as T) : d);
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** Any stored or imported value → valid settings. Unknown keys are dropped; bad values fall back to defaults. */
export function parseSettings(raw: unknown): Settings {
  const r = isObj(raw) ? raw : {};
  const d = DEFAULT_SETTINGS;
  const audio = isObj(r.audio) ? r.audio : {};
  const goal = isObj(r.goal) ? r.goal : {};
  const disabled = Array.isArray(r.disabled)
    ? [...new Set(r.disabled.filter((t): t is ExerciseType => (EXERCISE_TYPES as readonly string[]).includes(t as string) && t !== 'karte'))]
    : [];
  const runLength = int(r.runLength, LIMITS.runLength, d.runLength);
  return {
    version: 1,
    disabled,
    runLength,
    newPerRun: Math.min(int(r.newPerRun, LIMITS.newPerRun, d.newPerRun), runLength),
    runGapMin: int(r.runGapMin, LIMITS.runGapMin, d.runGapMin),
    theme: oneOf(THEMES, r.theme, d.theme),
    haptics: typeof r.haptics === 'boolean' ? r.haptics : d.haptics,
    goal: {
      enabled: goal.enabled === true,
      runsPerWeek: int(goal.runsPerWeek, LIMITS.runsPerWeek, d.goal.runsPerWeek),
    },
    audio: {
      provider: oneOf(AUDIO_PROVIDERS, audio.provider, d.audio.provider),
      voiceId: str(audio.voiceId, 64).replace(/[^A-Za-z0-9_-]/g, ''),
      modelId: str(audio.modelId, 64).replace(/[^A-Za-z0-9_.-]/g, ''),
      prefetch: audio.prefetch === true,
      dailyCharCap: int(audio.dailyCharCap, LIMITS.dailyCharCap, d.audio.dailyCharCap),
      cacheMaxMB: int(audio.cacheMaxMB, LIMITS.cacheMaxMB, d.audio.cacheMaxMB),
    },
  };
}

export const isEnabled = (s: Pick<Settings, 'disabled'>, t: ExerciseType) => t === 'karte' || !s.disabled.includes(t);

// ---------------------------------------------------------------- export / import

export interface ExportEnvelope<E> {
  app: 'strecke';
  kind: 'backup';
  version: 1;
  exportedAt: string;
  settings: Settings;
  events: E[];
}

export function makeExport<E>(settings: Settings, events: readonly E[], now: number): ExportEnvelope<E> {
  return { app: 'strecke', kind: 'backup', version: 1, exportedAt: new Date(now).toISOString(), settings, events: [...events] };
}

/** Parse a backup file's text. Never throws; reports why a file was not accepted. */
export function readExport(text: string, isEvent: (e: unknown) => boolean): { ok: true; settings: Settings; events: unknown[] } | { ok: false; error: string } {
  let data: unknown;
  try { data = JSON.parse(text); } catch { return { ok: false, error: 'not_json' }; }
  if (!isObj(data) || data.app !== 'strecke' || data.kind !== 'backup') return { ok: false, error: 'not_a_strecke_backup' };
  if (data.version !== 1) return { ok: false, error: 'unknown_version' };
  const events = Array.isArray(data.events) ? data.events.filter(isEvent) : [];
  return { ok: true, settings: parseSettings(data.settings), events };
}
