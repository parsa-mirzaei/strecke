import { useState } from 'preact/hooks';
import type { SourceInfo } from '@core/data/adapter.ts';
import { SheetAdapter } from '@core/data/sheet.ts';
import type { Note } from '@core/sheet/contract.ts';
import { parsePublishedLink } from '@core/sheet/link.ts';
import type { Ctx } from '../appctx';
import { csvTextSource } from '../data/source';
import { formatTime, t, type StringKey } from '../i18n';
import { en } from '../i18n/en';
import { SHEET_LINK_EXAMPLE } from '../i18n/names';
import { Icon } from '../ui/Icon';

const has = (k: string): k is StringKey => k in en;

/** A sync error code → a plain sentence. */
export function sheetError(e?: string | null): string {
  if (!e) return '';
  if (e.startsWith('http_')) return t('sheet.err.http', { code: e.slice(5) });
  const known = ['no_header', 'empty', 'not_csv', 'not_published', 'offline', 'timeout', 'unreachable'];
  return known.includes(e) ? t(`sheet.err.${e}` as StringKey) : t('sheet.err.unreachable');
}

/** A row note (a code from the sheet contract) → a short, neutral phrase. */
export function noteText(n: Note): string {
  const column = n.column ? (has(`col.${n.column}`) ? t(`col.${n.column}` as StringKey) : n.column) : '';
  const base = (n.reason ?? '').split(':')[0]!;
  const reason = base ? (has(`reason.${base}`) ? t(`reason.${base}` as StringKey) : t('reason.other')) : '';
  return t(`note.${n.code}` as StringKey, { column, value: n.value ?? '', reason });
}

/** The Meta tab's schema_version, when it differs from the app's: one plain sentence. */
function schemaText(s: SourceInfo['schema'] | undefined): string {
  if (!s) return '';
  if (s.status === 'newer' || s.status === 'older') return t(`sheet.schema.${s.status}`, { sheet: s.sheet, app: s.app });
  if (s.status === 'unreadable') return t('sheet.schema.unreadable', { value: s.value, app: s.app });
  return '';
}

/** A pasted link → the CSV link to store, or a sentence saying what is wrong. */
function checkLink(input: string): { url: string } | { problem: string } {
  const r = parsePublishedLink(input);
  return r.ok ? { url: r.csvUrl } : { problem: t(`sheet.link.${r.problem}`) };
}

/** Settings › Data › Source: connect the sheet, see what the last sync did and which rows are incomplete. */
export function SheetSection({ ctx }: { ctx: Ctx }) {
  const info = ctx.sourceInfo;
  const sh = ctx.settings.sheet;
  const [url, setUrl] = useState('');
  const [inbox, setInbox] = useState(sh.inboxUrl);
  const [meta, setMeta] = useState(sh.metaUrl);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const isSheet = ctx.adapter.kind === 'sheet';
  const linked = !!sh.csvUrl;
  const byFile = !linked && !!sh.fileName;

  async function refresh() {
    setBusy(true);
    const r = await ctx.sync();
    setBusy(false);
    if (!r.ok) { setMsg(sheetError(r.error)); return; }
    const p = r.report!;
    const parts = [
      p.added.length ? t('sheet.part.added', { n: p.added.length }) : '',
      p.updated.length ? t('sheet.part.updated', { n: p.updated.length }) : '',
      p.renamed.length ? t('sheet.part.renamed', { n: p.renamed.length }) : '',
      p.archived.length ? t('sheet.part.archived', { n: p.archived.length }) : '',
      p.restored.length ? t('sheet.part.restored', { n: p.restored.length }) : '',
    ].filter(Boolean);
    setMsg(parts.length ? t('sheet.updated', { parts: parts.join(', ') }) : t('sheet.noChange'));
  }

  /** The optional tabs: an empty field removes the tab; a bad link stops with a message. */
  function optionalLinks(): { inboxUrl: string; metaUrl: string } | null {
    const out = { inboxUrl: '', metaUrl: '' };
    for (const [k, v] of [['inboxUrl', inbox], ['metaUrl', meta]] as const) {
      if (!v.trim()) continue;
      const c = checkLink(v);
      if ('problem' in c) { setMsg(c.problem); return null; }
      out[k] = c.url;
    }
    return out;
  }

  function connect() {
    const c = checkLink(url);
    if ('problem' in c) { setMsg(c.problem); return; }
    const opt = optionalLinks();
    if (!opt) return;
    ctx.setSettings({ ...ctx.settings, sheet: { csvUrl: c.url, ...opt, fileName: '' } });
    location.reload();
  }
  function saveTabs() {
    const opt = optionalLinks();
    if (!opt) return;
    ctx.setSettings({ ...ctx.settings, sheet: { ...sh, ...opt } });
    location.reload();
  }
  function disconnect() {
    ctx.setSettings({ ...ctx.settings, sheet: { csvUrl: '', inboxUrl: '', metaUrl: '', fileName: '' } });
    location.reload();
  }
  /** A CSV file instead of a link (or when the link cannot be read on this phone). Created nothing anywhere. */
  async function importCsv(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    const src = csvTextSource(await file.text(), file.name);
    if (isSheet) {
      const r = await ctx.sync(src);
      setBusy(false);
      setMsg(r.ok ? t('sheet.read', { added: r.report!.added.length, updated: r.report!.updated.length }) : sheetError(r.error));
      if (r.ok && !linked) ctx.setSettings({ ...ctx.settings, sheet: { ...sh, fileName: file.name } });
      return;
    }
    const r = await new SheetAdapter(ctx.app.kv, Date.now, '', ctx.app.events).sync(src);
    setBusy(false);
    if (!r.ok) { setMsg(sheetError(r.error)); return; }
    ctx.setSettings({ ...ctx.settings, sheet: { csvUrl: '', inboxUrl: '', metaUrl: '', fileName: file.name } });
    location.reload();
  }

  const filePicker = (
    <label class="small-btn"><Icon name="upload" size={18} />{t('sheet.pickFile')}<input type="file" accept=".csv,text/csv" class="sr-only" onChange={(e) => void importCsv((e.currentTarget as HTMLInputElement).files?.[0])} /></label>
  );
  const tabFields = (
    <>
      <input class="text-in" type="url" inputmode="url" autocomplete="off" spellcheck={false} aria-label={t('sheet.inboxLabel')} placeholder={t('sheet.inboxLabel')}
        value={inbox} onInput={(e) => setInbox((e.currentTarget as HTMLInputElement).value)} />
      <input class="text-in" type="url" inputmode="url" autocomplete="off" spellcheck={false} aria-label={t('sheet.metaLabel')} placeholder={t('sheet.metaLabel')}
        value={meta} onInput={(e) => setMeta((e.currentTarget as HTMLInputElement).value)} />
    </>
  );

  const issues = info?.issues ?? [];
  const schema = schemaText(info?.schema);
  const ib = info?.inbox;
  return (
    <>
      <p class="kicker">{t('sheet.source')}</p>
      {isSheet ? (
        <>
          <div class="field"><div class="lbl">{byFile ? t('sheet.byFile', { name: sh.fileName }) : t('sheet.yours')}<small>{t('sheet.inPractice', { n: ctx.words.length })}{info?.archived ? ` · ${t('sheet.archived', { n: info.archived })}` : ''}</small></div></div>
          <div class="field">
            <div class="lbl">{t('sheet.lastRead')}<small>{info?.lastSync ? formatTime(info.lastSync) : '–'}{info?.lastError ? ` · ${t('sheet.lastTry', { reason: sheetError(info.lastError) })}` : ''}</small></div>
            {ctx.source ? <button class="small-btn" type="button" disabled={busy} onClick={refresh}><Icon name="refresh-cw" size={18} />{t('sheet.readNow')}</button> : null}
          </div>
          {ib?.ok ? <div class="field"><div class="lbl">{t('sheet.inbox', { waiting: ib.waiting, processed: ib.processed })}</div></div> : null}
          {msg ? <p class="note" role="status">{msg}</p> : null}
          {schema ? <p class="note">{schema}</p> : null}
          <p class="note">{byFile ? t('sheet.byFileNote') : t('sheet.autoNote')}</p>
        </>
      ) : (
        <>
          <div class="field"><div class="lbl">{t('sheet.demo')}<small>{t('sheet.inPractice', { n: ctx.words.length })}</small></div></div>
          <p class="note" style={{ marginTop: '6px' }}>{t('sheet.howTo')}</p>
          <ol class="note steps">
            <li>{t('sheet.step1')}</li>
            <li>{t('sheet.step2')}</li>
            <li>{t('sheet.step3')}</li>
          </ol>
          <p class="warn">{t('sheet.publicWarn')}</p>
          <input class="text-in" type="url" inputmode="url" autocomplete="off" spellcheck={false} aria-label={t('sheet.linkLabel')} placeholder={SHEET_LINK_EXAMPLE}
            value={url} onInput={(e) => setUrl((e.currentTarget as HTMLInputElement).value)} />
          <details class="more-set">
            <summary>{t('sheet.optional')}</summary>
            {tabFields}
          </details>
          <div class="btn-row"><button class="small-btn solid" type="button" disabled={!url.trim()} onClick={connect}>{t('sheet.connect')}</button></div>
          {msg ? <p class="note" role="status">{msg}</p> : null}
          <details class="more-set">
            <summary>{t('sheet.fileInstead')}</summary>
            <p class="note">{t('sheet.fileNote')}</p>
            <div class="btn-row">{filePicker}</div>
          </details>
        </>
      )}

      {isSheet && (issues.length || info?.duplicates.length || info?.unknownColumns.length) ? (
        <>
          <p class="kicker">{t('sheet.issues')}</p>
          <p class="note">{t('sheet.issuesNote')}</p>
          <ul class="hard-list">
            {issues.slice(0, 30).map((i) => {
              const notes = i.notes.map(noteText).join(' · ');
              return (
                <li key={`i${i.line}`}><div><span class="nm">{i.de ? t('sheet.rowWord', { line: i.line, word: i.de }) : t('sheet.row', { line: i.line })}</span><br /><span class="ct">{i.skipped ? t('sheet.skipped', { notes }) : notes}</span></div></li>
              );
            })}
            {(info?.duplicates ?? []).slice(0, 10).map((d) => (
              <li key={`d${d.line}`}><div><span class="nm">{t('sheet.rowWord', { line: d.line, word: d.de })}</span><br /><span class="ct">{t('sheet.duplicate', { first: d.firstLine })}</span></div></li>
            ))}
          </ul>
          {issues.length > 30 ? <p class="note">{t('sheet.more', { n: issues.length - 30 })}</p> : null}
          {info?.unknownColumns.length ? <p class="note">{t('sheet.unknownCols', { cols: info.unknownColumns.join(', ') })}</p> : null}
        </>
      ) : null}

      {isSheet ? (
        <details class="more-set">
          <summary>{t('common.advanced')}</summary>
          {linked ? (
            <>
              <p class="note">{t('sheet.optional')}</p>
              {tabFields}
              <div class="btn-row"><button class="small-btn" type="button" onClick={saveTabs}>{t('common.save')}</button></div>
            </>
          ) : null}
          <p class="note">{t('sheet.fileNote')}</p>
          <div class="btn-row">
            {filePicker}
            {linked || byFile ? <button class="small-btn" type="button" onClick={disconnect}>{t('sheet.disconnect')}</button> : null}
          </div>
        </details>
      ) : null}
    </>
  );
}
