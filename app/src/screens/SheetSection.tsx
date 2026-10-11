import { useState } from 'preact/hooks';
import { sheetUrl } from '@core/engine/settings.ts';
import type { Ctx } from '../appctx';
import { csvTextSource } from '../data/source';
import { formatTime, t, type StringKey } from '../i18n';
import { SHEET_LINK_EXAMPLE } from '../i18n/names';
import { Icon } from '../ui/Icon';

/** A sync error code → a plain sentence. */
export function sheetError(e?: string | null): string {
  if (!e) return '';
  if (e.startsWith('http_')) return t('sheet.err.http', { code: e.slice(5) });
  const known = ['no_header', 'empty', 'not_csv', 'not_published', 'offline', 'timeout', 'unreachable'];
  return known.includes(e) ? t(`sheet.err.${e}` as StringKey) : t('sheet.err.unreachable');
}

/** Settings › Data › Source: connect the sheet, see what the last sync did and which rows are incomplete. */
export function SheetSection({ ctx }: { ctx: Ctx }) {
  const info = ctx.sourceInfo;
  const [url, setUrl] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const isSheet = ctx.adapter.kind === 'sheet';
  const linked = !!ctx.settings.sheet.csvUrl;

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

  function connect() {
    const clean = sheetUrl(url);
    if (!clean) { setMsg(t('sheet.link.not_published')); return; }
    ctx.setSettings({ ...ctx.settings, sheet: { ...ctx.settings.sheet, csvUrl: clean } });
    location.reload();
  }
  function disconnect() {
    ctx.setSettings({ ...ctx.settings, sheet: { ...ctx.settings.sheet, csvUrl: '' } });
    location.reload();
  }
  async function importCsv(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    const r = await ctx.sync(csvTextSource(await file.text()));
    setBusy(false);
    setMsg(r.ok ? t('sheet.read', { added: r.report!.added.length, updated: r.report!.updated.length }) : sheetError(r.error));
  }

  const issues = info?.issues ?? [];
  return (
    <>
      <p class="kicker">{t('sheet.source')}</p>
      {isSheet ? (
        <>
          <div class="field"><div class="lbl">{t('sheet.yours')}<small>{t('sheet.inPractice', { n: ctx.words.length })}{info?.archived ? ` · ${t('sheet.archived', { n: info.archived })}` : ''}</small></div></div>
          <div class="field">
            <div class="lbl">{t('sheet.lastRead')}<small>{info?.lastSync ? formatTime(info.lastSync) : '–'}{info?.lastError ? ` · ${t('sheet.lastTry', { reason: sheetError(info.lastError) })}` : ''}</small></div>
            {ctx.source ? <button class="small-btn" type="button" disabled={busy} onClick={refresh}><Icon name="refresh-cw" size={18} />{t('sheet.readNow')}</button> : null}
          </div>
          {msg ? <p class="note" role="status">{msg}</p> : null}
          <p class="note">{t('sheet.autoNote')}</p>
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
          <div class="btn-row"><button class="small-btn solid" type="button" disabled={!url.trim()} onClick={connect}>{t('sheet.connect')}</button></div>
          {msg ? <p class="note" role="status">{msg}</p> : null}
        </>
      )}

      {isSheet && (issues.length || info?.duplicates.length || info?.unknownColumns.length) ? (
        <>
          <p class="kicker">{t('sheet.issues')}</p>
          <p class="note">{t('sheet.issuesNote')}</p>
          <ul class="hard-list">
            {issues.slice(0, 30).map((i) => (
              <li key={`i${i.line}`}><div><span class="nm">{i.de ? t('sheet.rowWord', { line: i.line, word: i.de }) : t('sheet.row', { line: i.line })}</span><br /><span class="ct">{i.skipped ? t('sheet.skipped', { notes: i.notes.join(' · ') }) : i.notes.join(' · ')}</span></div></li>
            ))}
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
          <div class="btn-row">
            <label class="small-btn"><Icon name="upload" size={18} />{t('sheet.pickFile')}<input type="file" accept=".csv,text/csv" class="sr-only" onChange={(e) => void importCsv((e.currentTarget as HTMLInputElement).files?.[0])} /></label>
            {linked ? <button class="small-btn" type="button" onClick={disconnect}>{t('sheet.disconnect')}</button> : null}
          </div>
        </details>
      ) : null}
    </>
  );
}
