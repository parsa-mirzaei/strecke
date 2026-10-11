/**
 * Settings › Fill my list (DECISIONS D58). The app helps the learner take generated instructions to
 * THEIR OWN AI assistant: it builds the text, copies it, and opens the assistant's site. It never
 * calls an AI service and never connects to an AI account.
 */
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { buildInstructions, missingCritical, type ExampleStyle, type FillText, type Provider } from '../../../../core/src/sheet/instructions.ts';
import { parseSheetReference } from '../../../../core/src/sheet/link.ts';
import type { SheetRow } from '../../../../core/src/sheet/parse.ts';
import { formatDate, t, type StringKey } from '../../i18n';
import type { SheetCache, SheetConnection } from '../../sheet/sync';
import { CopyIcon, ExternalIcon } from '../icons';

export interface FillPrefs {
  sheetRef: string;
  level: string;
  /** Free text used when `level` is 'other'. */
  levelText: string;
  wordsPerRun: number;
  everyDays: number;
  topics: string;
  exampleStyle: ExampleStyle;
  provider: Provider;
  /** The learner's own edited text, or null for the generated default. */
  custom: string | null;
}

export const DEFAULT_FILL: FillPrefs = {
  sheetRef: '', level: 'around', levelText: '', wordsPerRun: 10, everyDays: 1, topics: '', exampleStyle: 'everyday',
  provider: 'claude', custom: null,
};

const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'around', 'other'] as const;
const DAYS = [1, 2, 3, 4, 5, 7, 14] as const;
const STYLES: ExampleStyle[] = ['everyday', 'simple', 'work', 'formal'];
const PROVIDERS: Provider[] = ['claude', 'chatgpt', 'other'];

/**
 * Where "Generate now" opens. Prefilled-prompt links are not used: neither provider documents one
 * that works in its web app and Android app (D58), so the text is always copied instead.
 */
export const PROVIDER_HOME: Record<Provider, string | null> = {
  claude: 'https://claude.ai/new',
  chatgpt: 'https://chatgpt.com/',
  other: null,
};

export type Gate = 'ok' | 'not_connected' | 'file_only' | 'no_reference';

export function gate(conn: SheetConnection | null, cache: SheetCache | null, sheetRef: string): Gate {
  if (!conn || !cache || !cache.headers.length) return 'not_connected';
  if (conn.kind !== 'link') return 'file_only';
  if (!parseSheetReference(sheetRef).ok) return 'no_reference';
  return 'ok';
}

/** "Last row added by your AI: <date>" or "No AI rows yet". */
export function aiHealth(rows: readonly SheetRow[]): { kind: 'none' } | { kind: 'dated'; date: string } | { kind: 'undated'; count: number } {
  const agent = rows.filter((r) => r.meta.source === 'agent');
  if (!agent.length) return { kind: 'none' };
  const dates = agent.map((r) => r.meta.added).filter(Boolean).sort();
  return dates.length ? { kind: 'dated', date: dates.at(-1)! } : { kind: 'undated', count: agent.length };
}

export function levelOf(p: FillPrefs): string {
  if (p.level === 'around') return 'around the level of the words already in my list';
  if (p.level === 'other') return p.levelText.trim();
  return p.level;
}

export function instructionsFor(p: FillPrefs, cache: SheetCache): FillText {
  const ref = parseSheetReference(p.sheetRef);
  return buildInstructions({
    sheetUrl: ref.ok ? ref.url : p.sheetRef.trim(),
    wordHeaders: cache.headers,
    inboxHeaders: cache.inbox?.ok ? cache.inbox.headers : null,
    level: levelOf(p),
    wordsPerRun: p.wordsPerRun,
    everyDays: p.everyDays,
    topics: p.topics,
    exampleStyle: p.exampleStyle,
    provider: p.provider,
  });
}

async function copy(text: string, fallback: HTMLTextAreaElement | null): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    if (!fallback) return false;
    fallback.focus();
    fallback.select();
    try {
      return document.execCommand('copy');
    } catch {
      return false;
    }
  }
}

const GATE_TEXT: Record<Exclude<Gate, 'ok'>, StringKey> = {
  not_connected: 'fill.gate.notConnected',
  file_only: 'fill.gate.fileOnly',
  no_reference: 'fill.gate.noReference',
};

const PART_KEY: Record<keyof FillText['critical'], StringKey> = {
  sheet: 'fill.part.sheet', columns: 'fill.part.columns', appendOnly: 'fill.part.appendOnly', noDuplicates: 'fill.part.noDuplicates',
};

export interface FillMyListProps {
  connection: SheetConnection | null;
  cache: SheetCache | null;
  prefs: FillPrefs;
  onPrefs: (p: FillPrefs) => void;
  /** Opens a URL in a new tab; injectable for tests. */
  open?: (url: string) => void;
}

export function FillMyList({ connection, cache, prefs: p, onPrefs, open = (u) => window.open(u, '_blank', 'noopener') }: FillMyListProps) {
  const [status, setStatus] = useState('');
  const [guide, setGuide] = useState(false);
  const boxRef = useRef<HTMLTextAreaElement>(null);
  const g = gate(connection, cache, p.sheetRef);
  const ready = g === 'ok';

  const update = (next: Partial<FillPrefs>) => onPrefs({ ...p, ...next });
  useEffect(() => setStatus(''), [p.provider]);

  const built = useMemo(() => (cache && cache.headers.length ? instructionsFor(p, cache) : null), [p, cache]);
  const text = p.custom ?? built?.text ?? '';
  const missing = built && p.custom !== null ? missingCritical(p.custom, built.critical) : [];
  const health = cache ? aiHealth(cache.rows) : { kind: 'none' as const };

  const generateNow = async () => {
    const ok = await copy(text, boxRef.current);
    const home = PROVIDER_HOME[p.provider];
    if (home) open(home);
    setStatus(!ok ? t('fill.copyFailed') : home ? t(p.provider === 'claude' ? 'fill.copiedClaude' : 'fill.copiedChatgpt') : t('fill.copiedOther'));
  };
  const schedule = async () => {
    const ok = await copy(text, boxRef.current);
    setGuide(true);
    setStatus(ok ? t('fill.copiedSchedule') : t('fill.copyFailed'));
  };

  const field = (label: StringKey, control: preact.ComponentChildren, note?: StringKey) => (
    <label class="field">
      <span>{t(label)}</span>
      {control}
      {note && <small class="explain">{t(note)}</small>}
    </label>
  );

  return (
    <div class="fill">
      <p class="explain">{t('fill.intro')}</p>
      <dl class="facts">
        <dt>{t('fill.health')}</dt>
        <dd>{health.kind === 'dated' ? formatDate(Date.parse(`${health.date}T12:00:00`)) : health.kind === 'undated' ? t('fill.healthUndated') : t('fill.healthNone')}</dd>
      </dl>

      {!ready && <p class="gate" role="note">{t(GATE_TEXT[g as Exclude<Gate, 'ok'>])}</p>}

      <div class="stack">
        {field('fill.sheetRef', (
          <input type="url" inputMode="url" autocomplete="off" autocapitalize="off" spellcheck={false} value={p.sheetRef}
            onInput={(e) => update({ sheetRef: (e.target as HTMLInputElement).value })} />
        ), 'fill.sheetRefNote')}
        {field('fill.level', (
          <select value={p.level} onChange={(e) => update({ level: (e.target as HTMLSelectElement).value })}>
            {LEVELS.map((l) => <option key={l} value={l}>{l === 'around' ? t('fill.levelAround') : l === 'other' ? t('fill.levelOther') : l}</option>)}
          </select>
        ))}
        {p.level === 'other' && field('fill.levelText', (
          <input type="text" value={p.levelText} onInput={(e) => update({ levelText: (e.target as HTMLInputElement).value })} />
        ))}
        {field('fill.perRun', (
          <input type="number" inputMode="numeric" min={1} max={50} value={p.wordsPerRun}
            onInput={(e) => update({ wordsPerRun: Math.max(1, Math.min(50, Number((e.target as HTMLInputElement).value) || 1)) })} />
        ))}
        {field('fill.cadence', (
          <select value={String(p.everyDays)} onChange={(e) => update({ everyDays: Number((e.target as HTMLSelectElement).value) })}>
            {DAYS.map((d) => <option key={d} value={String(d)}>{d === 1 ? t('fill.daily') : t('fill.everyDays', { n: d })}</option>)}
          </select>
        ))}
        {field('fill.topics', (
          <input type="text" value={p.topics} onInput={(e) => update({ topics: (e.target as HTMLInputElement).value })} />
        ), 'fill.topicsNote')}
        {field('fill.style', (
          <select value={p.exampleStyle} onChange={(e) => update({ exampleStyle: (e.target as HTMLSelectElement).value as ExampleStyle })}>
            {STYLES.map((s) => <option key={s} value={s}>{t(`fill.style.${s}` as StringKey)}</option>)}
          </select>
        ))}
        <div class="field">
          <span>{t('fill.provider')}</span>
          <div class="seg" role="radiogroup" aria-label={t('fill.provider')}>
            {PROVIDERS.map((v) => (
              <button type="button" role="radio" key={v} aria-checked={p.provider === v} onClick={() => update({ provider: v })}>
                {t(`fill.provider.${v}` as StringKey)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {built && (
        <label class="field">
          <span>{t('fill.text')}</span>
          <textarea ref={boxRef} rows={12} spellcheck={false} value={text}
            onInput={(e) => update({ custom: (e.target as HTMLTextAreaElement).value })} />
          <small class="explain">{t('fill.textNote')}</small>
        </label>
      )}
      {p.custom !== null && (
        <button type="button" class="quiet" onClick={() => update({ custom: null })}>{t('fill.reset')}</button>
      )}
      {missing.length > 0 && (
        <p class="warning" role="status">{t('fill.missingWarning', { parts: missing.map((m) => t(PART_KEY[m])).join(', ') })}</p>
      )}

      <div class="stack">
        <button type="button" class="primary" disabled={!ready} onClick={generateNow}>
          {PROVIDER_HOME[p.provider] ? <ExternalIcon /> : <CopyIcon />}
          <span>{PROVIDER_HOME[p.provider] ? t('fill.generateNow') : t('fill.copy')}</span>
        </button>
        <button type="button" class="secondary" disabled={!ready} onClick={schedule}>
          <span>{t('fill.schedule')}</span>
        </button>
      </div>
      {status && <p class="status" role="status">{status}</p>}

      {guide && ready && (
        <div class="plan">
          <h3 class="field-label">{t(`fill.guide.${p.provider}.title` as StringKey)}</h3>
          <ol>
            {([1, 2, 3, 4, 5] as const).map((i) => {
              const key = `fill.guide.${p.provider}.${i}` as StringKey;
              return <li key={i}>{t(key)}</li>;
            })}
          </ol>
          <p class="explain">{t(`fill.guide.${p.provider}.honest` as StringKey)}</p>
          <p class="explain">{t('fill.guide.onlyYou')}</p>
        </div>
      )}
      <p class="explain">{t('fill.afterReturn')}</p>
    </div>
  );
}
