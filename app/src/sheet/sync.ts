/**
 * Reading the learner's published sheet (DECISIONS D56): connect, sync, and the cached copy the app
 * practises from. Read-only: the app never writes to the sheet. Offline-safe: a failed read keeps the
 * last good copy and only records why it failed. Idempotent: the same CSV text gives the same cache.
 */
import { diffRows, parseWordsCsv, type SheetDiff, type SheetProblem, type SheetRow } from '../../../core/src/sheet/parse.ts';
import { parseInboxCsv, readSchemaVersion, type InboxRead, type SchemaCheck } from '../../../core/src/sheet/tabs.ts';
import { parsePublishedLink, type LinkProblem } from '../../../core/src/sheet/link.ts';
import type { WordsColumn } from '../../../core/src/sheet/contract.ts';
import { sha256 } from '../../../core/src/sha256.ts';

export interface SheetConnection {
  kind: 'link' | 'file';
  /** CSV links (kind 'link'). Never logged, never sent anywhere but Google. */
  wordsUrl: string;
  inboxUrl: string;
  metaUrl: string;
  /** kind 'file': the imported file's name. */
  fileName: string;
  connectedAt: number;
}

export interface SheetCache {
  textHash: string;
  /** The words tab's header row as written; Fill my list builds its column order from it. */
  headers: string[];
  rows: SheetRow[];
  columns: WordsColumn[];
  unknownColumns: string[];
  /** Last successful read of the words tab. */
  syncedAt: number;
  /** Last attempt, successful or not. */
  attemptAt: number;
  lastProblem: FetchProblem | SheetProblem | null;
  inbox: InboxRead | null;
  schema: SchemaCheck;
}

export type FetchProblem = 'offline' | 'unreachable' | 'timeout' | 'not_published' | `http_${number}`;

export type Fetcher = (url: string, init: RequestInit) => Promise<Pick<Response, 'ok' | 'status' | 'text'> & { headers: { get(name: string): string | null } }>;

export interface Env {
  fetch: Fetcher;
  now: () => number;
  online: () => boolean;
  timeoutMs?: number;
}

export const browserEnv = (): Env => ({
  fetch: (url, init) => fetch(url, init),
  now: () => Date.now(),
  online: () => (typeof navigator === 'undefined' ? true : navigator.onLine !== false),
});

/** One GET of a published CSV. No cookies, no cache, a hard timeout. */
export async function fetchCsv(url: string, env: Env): Promise<{ ok: true; text: string } | { ok: false; problem: FetchProblem }> {
  if (!env.online()) return { ok: false, problem: 'offline' };
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = setTimeout(() => ctl?.abort(), env.timeoutMs ?? 15_000);
  try {
    const res = await env.fetch(url, { cache: 'no-store', credentials: 'omit', redirect: 'follow', signal: ctl?.signal ?? null });
    if (res.status === 404 || res.status === 410) return { ok: false, problem: 'not_published' };
    if (!res.ok) return { ok: false, problem: `http_${res.status}` };
    const text = await res.text();
    const type = res.headers.get('content-type') ?? '';
    // Google answers an unpublished or private tab with a web page (sign-in or "not published").
    if (/text\/html/i.test(type) || /^\s*<(!doctype|html)/i.test(text)) return { ok: false, problem: 'not_published' };
    return { ok: true, text };
  } catch (err) {
    if ((err as { name?: string })?.name === 'AbortError') return { ok: false, problem: 'timeout' };
    return { ok: false, problem: env.online() ? 'unreachable' : 'offline' };
  } finally {
    clearTimeout(timer);
  }
}

export interface SyncResult {
  cache: SheetCache;
  /** null when nothing new was read (failure, or the CSV text is byte-for-byte the same). */
  diff: SheetDiff | null;
  problem: FetchProblem | SheetProblem | null;
}

/** Parse words-tab text into a fresh cache, given what the app had before. */
export function cacheFromText(text: string, prev: SheetCache | null, now: number, extras: { inbox: InboxRead | null; schema: SchemaCheck }): SyncResult {
  const textHash = sha256(text);
  if (prev && prev.textHash === textHash) {
    return { cache: { ...prev, syncedAt: now, attemptAt: now, lastProblem: null, ...extras }, diff: null, problem: null };
  }
  const parsed = parseWordsCsv(text);
  if (!parsed.ok) {
    const base = prev ?? emptyCache();
    return { cache: { ...base, attemptAt: now, lastProblem: parsed.problem }, diff: null, problem: parsed.problem };
  }
  const diff = diffRows(prev?.rows ?? null, parsed.rows);
  return {
    cache: {
      textHash, headers: parsed.headers, rows: parsed.rows, columns: parsed.columns, unknownColumns: parsed.unknownColumns,
      syncedAt: now, attemptAt: now, lastProblem: null, ...extras,
    },
    diff,
    problem: null,
  };
}

export function emptyCache(): SheetCache {
  return { textHash: '', headers: [], rows: [], columns: [], unknownColumns: [], syncedAt: 0, attemptAt: 0, lastProblem: null, inbox: null, schema: { status: 'none' } };
}

/** Read every connected tab. Optional tabs that fail are simply left out (never an error). */
export async function syncSheet(conn: SheetConnection, prev: SheetCache | null, env: Env): Promise<SyncResult> {
  const now = env.now();
  const words = await fetchCsv(conn.wordsUrl, env);
  if (!words.ok) {
    const base = prev ?? emptyCache();
    return { cache: { ...base, attemptAt: now, lastProblem: words.problem }, diff: null, problem: words.problem };
  }
  const [inboxText, metaText] = await Promise.all([
    conn.inboxUrl ? fetchCsv(conn.inboxUrl, env) : null,
    conn.metaUrl ? fetchCsv(conn.metaUrl, env) : null,
  ]);
  const inbox = inboxText?.ok ? parseInboxCsv(inboxText.text) : prev?.inbox ?? null;
  const schema = metaText?.ok ? readSchemaVersion(metaText.text) : prev?.schema ?? { status: 'none' as const };
  return cacheFromText(words.text, prev, now, { inbox: inbox && inbox.ok ? inbox : null, schema });
}

export type ConnectOutcome =
  | { ok: true; connection: SheetConnection; result: SyncResult }
  | { ok: false; problem: LinkProblem | FetchProblem | SheetProblem; field: 'words' | 'inbox' | 'meta'; sheetId?: string };

/** Check the pasted links, read the tabs once, and only then report success. Nothing is saved here. */
export async function connect(input: { words: string; inbox: string; meta: string }, env: Env): Promise<ConnectOutcome> {
  const links: Record<'words' | 'inbox' | 'meta', string> = { words: '', inbox: '', meta: '' };
  for (const field of ['words', 'inbox', 'meta'] as const) {
    if (field !== 'words' && !input[field].trim()) continue;
    const l = parsePublishedLink(input[field]);
    if (!l.ok) return { ok: false, problem: l.problem, field, ...(l.sheetId ? { sheetId: l.sheetId } : {}) };
    links[field] = l.csvUrl;
  }
  const connection: SheetConnection = { kind: 'link', wordsUrl: links.words, inboxUrl: links.inbox, metaUrl: links.meta, fileName: '', connectedAt: env.now() };
  for (const field of ['inbox', 'meta'] as const) {
    if (!links[field]) continue;
    const r = await fetchCsv(links[field], env);
    if (!r.ok) return { ok: false, problem: r.problem, field };
    if (field === 'inbox') {
      const ib = parseInboxCsv(r.text);
      if (!ib.ok) return { ok: false, problem: ib.problem, field };
    }
  }
  const result = await syncSheet(connection, null, env);
  if (result.problem) return { ok: false, problem: result.problem, field: 'words' };
  return { ok: true, connection, result };
}

/** Fallback when the link cannot be read from the app: a CSV file downloaded from the tab. */
export function connectFile(text: string, fileName: string, prev: SheetCache | null, now: number): ConnectOutcome {
  const result = cacheFromText(text, prev, now, { inbox: null, schema: { status: 'none' } });
  if (result.problem) return { ok: false, problem: result.problem, field: 'words' };
  return {
    ok: true,
    connection: { kind: 'file', wordsUrl: '', inboxUrl: '', metaUrl: '', fileName: fileName.slice(0, 120), connectedAt: now },
    result,
  };
}

/** Re-sync when the learner comes back: at most once a minute, never offline, never for a file. */
export function shouldAutoSync(conn: SheetConnection | null, cache: SheetCache | null, now: number, online: boolean, minGapMs = 60_000): boolean {
  if (!conn || conn.kind !== 'link' || !online) return false;
  return !cache || now - cache.attemptAt >= minGapMs;
}
