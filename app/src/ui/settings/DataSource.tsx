/**
 * Settings › Data: which data is in use, and the connect flow for the learner's sheet (D56).
 * Plain language, numbered steps, a clear success line and clear reasons when something fails.
 */
import { useRef, useState } from 'preact/hooks';
import type { RowIssue, SheetRow } from '../../../../core/src/sheet/parse.ts';
import { formatTime, t, type StringKey } from '../../i18n';
import type { ConnectOutcome, SheetCache, SheetConnection, SyncResult } from '../../sheet/sync';
import { RefreshIcon, UploadIcon } from '../icons';

export interface DataSourceProps {
  connection: SheetConnection | null;
  cache: SheetCache | null;
  wordCount: number;
  skipped: number;
  onConnect: (links: { words: string; inbox: string; meta: string }) => Promise<ConnectOutcome>;
  onFile: (text: string, name: string) => Promise<ConnectOutcome>;
  onSync: () => Promise<SyncResult | null>;
  onDisconnect: () => void;
  onUnskip: () => void;
}

/** A reason in words. Fetch problems like `http_503` carry their status. */
export function problemText(p: string): string {
  if (p.startsWith('http_')) return t('problem.http', { status: p.slice(5) });
  return t(`problem.${p}` as StringKey);
}

export function issueText(row: SheetRow, issue: RowIssue): string {
  return t(`issue.${issue.code}` as StringKey, { first: issue.firstRow ?? '', column: issue.column ?? '' });
}

const MAX_LISTED = 30;

function Attention({ cache }: { cache: SheetCache }) {
  const rows = cache.rows.filter((r) => r.issues.length);
  if (!rows.length) return null;
  return (
    <details class="attention">
      <summary>{t('sheet.attentionTitle')} ({rows.length})</summary>
      <p class="explain">{t('sheet.attentionNote')}</p>
      <ul>
        {rows.slice(0, MAX_LISTED).map((r) => (
          <li key={r.rowNumber}>
            <span class="label">{t('sheet.row', { row: r.rowNumber })}</span>
            {r.word && <> · <span lang="de">{r.word}</span></>}
            {': '}
            {r.issues.map((i) => issueText(r, i)).join(', ')}
            {!r.record && <span class="tag"> · {t('sheet.leftOut')}</span>}
          </li>
        ))}
      </ul>
      {rows.length > MAX_LISTED && <p class="explain">{t('sheet.moreRows', { n: rows.length - MAX_LISTED })}</p>}
    </details>
  );
}

function Connect({ onConnect, onFile }: Pick<DataSourceProps, 'onConnect' | 'onFile'>) {
  const [links, setLinks] = useState({ words: '', inbox: '', meta: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const report = (r: ConnectOutcome) => {
    if (r.ok) return setError('');
    const reason = problemText(r.problem);
    setError(r.field === 'words' ? reason : t('problem.inField', { field: t(`field.${r.field}`), problem: reason }));
  };
  const submit = async (e: Event) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    report(await onConnect(links));
    setBusy(false);
  };
  const pickFile = async (e: Event) => {
    const input = e.target as HTMLInputElement;
    const f = input.files?.[0];
    input.value = '';
    if (f) report(await onFile(await f.text(), f.name));
  };
  const field = (k: 'words' | 'inbox' | 'meta', label: StringKey) => (
    <label class="field">
      <span>{t(label)}</span>
      <input
        type="url"
        inputMode="url"
        autocomplete="off"
        autocapitalize="off"
        spellcheck={false}
        value={links[k]}
        onInput={(e) => setLinks({ ...links, [k]: (e.target as HTMLInputElement).value })}
      />
    </label>
  );

  return (
    <div class="connect">
      <h3 class="field-label">{t('connect.title')}</h3>
      <p class="explain">{t('connect.intro')}</p>
      <details class="guide" open>
        <summary>{t('connect.guideTitle')}</summary>
        <ol>
          {(['connect.step1', 'connect.step2', 'connect.step3', 'connect.step4', 'connect.step5', 'connect.step6'] as const).map((k) => <li key={k}>{t(k)}</li>)}
        </ol>
        <p class="explain">{t('connect.uiNote')}</p>
      </details>
      <p class="warning">{t('connect.warning')}</p>
      <form class="stack" onSubmit={submit}>
        {field('words', 'connect.wordsLabel')}
        <details>
          <summary>{t('connect.more')}</summary>
          <div class="stack">
            {field('inbox', 'connect.inboxLabel')}
            {field('meta', 'connect.metaLabel')}
          </div>
        </details>
        <button type="submit" class="primary" disabled={busy}>{busy ? t('connect.checking') : t('connect.button')}</button>
      </form>
      {error && <p class="status" role="alert">{error}</p>}
      <h3 class="field-label">{t('connect.fileTitle')}</h3>
      <p class="explain">{t('connect.fileNote')}</p>
      <button type="button" class="secondary" onClick={() => fileRef.current?.click()}>
        <UploadIcon />
        <span>{t('connect.fileButton')}</span>
      </button>
      <input ref={fileRef} type="file" accept=".csv,text/csv,text/plain" hidden onChange={pickFile} />
    </div>
  );
}

export function DataSource(p: DataSourceProps) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [confirming, setConfirming] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { connection: conn, cache } = p;

  if (!conn || !cache) {
    return (
      <>
        <dl class="facts">
          <dt>{t('data.inUse')}</dt>
          <dd>{t('source.demo')}</dd>
        </dl>
        <Connect onConnect={p.onConnect} onFile={p.onFile} />
      </>
    );
  }

  const usable = cache.rows.filter((r) => r.record).length;
  const attention = cache.rows.filter((r) => r.issues.length).length;
  const sync = async () => {
    setBusy(true);
    const r = await p.onSync();
    setBusy(false);
    setStatus(r?.problem ? problemText(r.problem) : t('sheet.synced'));
  };
  const schema = cache.schema;

  return (
    <>
      <dl class="facts">
        <dt>{t('data.inUse')}</dt>
        <dd>{cache.syncedAt ? t('source.sheet', { n: p.wordCount, time: formatTime(cache.syncedAt) }) : t('source.sheetNotYet', { n: p.wordCount })}</dd>
      </dl>
      <p class="explain">{t('connect.success', { rows: usable, attention })}</p>
      {conn.kind === 'file' && <p class="explain">{t('sheet.file', { name: conn.fileName })}</p>}
      {cache.lastProblem && (
        <p class="explain" role="status">{t('sheet.lastFailed', { reason: problemText(cache.lastProblem), time: formatTime(cache.syncedAt) })}</p>
      )}
      {schema.status === 'newer' && <p class="explain">{t('sheet.schemaNewer', { sheet: schema.sheet, app: schema.app })}</p>}
      {schema.status === 'older' && <p class="explain">{t('sheet.schemaOlder', { sheet: schema.sheet, app: schema.app })}</p>}
      {schema.status === 'unreadable' && <p class="explain">{t('sheet.schemaUnreadable', { value: schema.value })}</p>}
      {cache.inbox?.ok && <p class="explain">{cache.inbox.waiting === 1 ? t('sheet.inboxWaitingOne') : cache.inbox.waiting ? t('sheet.inboxWaiting', { n: cache.inbox.waiting }) : t('sheet.inboxEmpty')}</p>}
      {cache.unknownColumns.length > 0 && <p class="explain">{t('sheet.unknownColumns', { list: cache.unknownColumns.slice(0, 8).join(', ') })}</p>}
      <Attention cache={cache} />
      {p.skipped > 0 && (
        <div>
          <p class="explain">{t('sheet.skipped', { n: p.skipped })}</p>
          <button type="button" class="link" onClick={p.onUnskip}>{t('sheet.unskip')}</button>
        </div>
      )}
      <div class="stack">
        {conn.kind === 'link' ? (
          <button type="button" class="secondary" disabled={busy} onClick={sync}>
            <RefreshIcon />
            <span>{busy ? t('sheet.syncing') : t('sheet.syncNow')}</span>
          </button>
        ) : (
          <>
            <button type="button" class="secondary" onClick={() => fileRef.current?.click()}>
              <UploadIcon />
              <span>{t('sheet.importNewer')}</span>
            </button>
            <input ref={fileRef} type="file" accept=".csv,text/csv,text/plain" hidden onChange={async (e) => {
              const input = e.target as HTMLInputElement;
              const f = input.files?.[0];
              input.value = '';
              if (!f) return;
              const r = await p.onFile(await f.text(), f.name);
              setStatus(r.ok ? t('sheet.synced') : problemText(r.problem));
            }} />
          </>
        )}
        {!confirming ? (
          <button type="button" class="quiet" onClick={() => setConfirming(true)}>{t('sheet.disconnect')}</button>
        ) : (
          <div class="plan">
            <p>{t('sheet.disconnectNote')}</p>
            <div class="row">
              <button type="button" class="secondary" onClick={() => setConfirming(false)}>{t('common.cancel')}</button>
              <button type="button" class="primary" onClick={() => { setConfirming(false); p.onDisconnect(); }}>{t('sheet.disconnect')}</button>
            </div>
          </div>
        )}
      </div>
      {status && <p class="status" role="status">{status}</p>}
    </>
  );
}
