import { useState } from 'preact/hooks';
import { sheetUrl } from '@core/engine/settings.ts';
import type { Ctx } from '../appctx';
import { csvTextSource } from '../data/source';
import { Icon } from '../ui/Icon';

const when = (t: number | null) => (t ? new Date(t).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' }) : '–');

const ERR: Record<string, string> = {
  no_header: 'Die erste Zeile enthält keine Spalten „de“ und „en“ (oder „Wort“ und „Bedeutung“).',
  empty: 'Die Tabelle ist leer.',
  not_csv: 'Der Link liefert keine CSV-Datei. Bitte „Im Web veröffentlichen“ mit dem Format CSV wählen.',
};
const explain = (e?: string) => (!e ? '' : ERR[e] ?? (e.startsWith('http_') ? `Das Sheet hat mit Fehler ${e.slice(5)} geantwortet.` : 'Gerade keine Verbindung. Geübt wird mit der letzten Fassung auf diesem Gerät.'));

/** Settings > Daten > Quelle: connect the sheet, see what the last sync did and which rows are incomplete. */
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
    if (!r.ok) { setMsg(explain(r.error)); return; }
    const p = r.report!;
    const parts = [p.added.length && `${p.added.length} neu`, p.updated.length && `${p.updated.length} geändert`, p.renamed.length && `${p.renamed.length} umbenannt`,
      p.archived.length && `${p.archived.length} nicht mehr im Sheet`, p.restored.length && `${p.restored.length} wieder da`].filter(Boolean);
    setMsg(parts.length ? `Aktualisiert: ${parts.join(', ')}.` : 'Alles aktuell, nichts geändert.');
  }

  function connect() {
    const clean = sheetUrl(url);
    if (!clean) { setMsg('Das ist kein veröffentlichter CSV-Link von Google Sheets (er endet auf output=csv).'); return; }
    ctx.setSettings({ ...ctx.settings, sheet: { csvUrl: clean } });
    location.reload();
  }
  function disconnect() {
    ctx.setSettings({ ...ctx.settings, sheet: { csvUrl: '' } });
    location.reload();
  }
  async function importCsv(file: File | undefined) {
    if (!file) return;
    if (!isSheet) { setMsg('Eine CSV-Datei kann eingelesen werden, sobald ein Sheet verbunden ist.'); return; }
    setBusy(true);
    const r = await ctx.sync(csvTextSource(await file.text()));
    setBusy(false);
    setMsg(r.ok ? `Eingelesen: ${r.report!.added.length} neu, ${r.report!.updated.length} geändert.` : explain(r.error));
  }

  const issues = info?.issues ?? [];
  return (
    <>
      <p class="kicker">Quelle</p>
      {isSheet ? (
        <>
          <div class="field"><div class="lbl">Dein Google Sheet<small>{ctx.words.length} Wörter in der Übung{info?.archived ? ` · ${info.archived} nicht mehr im Sheet (Verlauf bleibt)` : ''}</small></div></div>
          <div class="field">
            <div class="lbl">Zuletzt gelesen<small>{when(info?.lastSync ?? null)}{info?.lastError ? ` · letzter Versuch: ${explain(info.lastError)}` : ''}</small></div>
            {ctx.source ? <button class="small-btn" type="button" disabled={busy} onClick={refresh}><Icon name="refresh-cw" size={18} />Jetzt lesen</button> : null}
          </div>
          {msg ? <p class="note" role="status">{msg}</p> : null}
          <p class="note">Neue und geänderte Zeilen kommen beim Öffnen der App von selbst dazu; ihr Lernstand bleibt erhalten. Gelöschte Zeilen werden nicht mehr geübt, ihr Verlauf bleibt.</p>
        </>
      ) : (
        <>
          <div class="field"><div class="lbl">Demo-Wörter, nur auf diesem Gerät<small>{ctx.words.length} Wörter</small></div></div>
          <p class="note" style={{ marginTop: '6px' }}>So verbindest du dein eigenes Google Sheet (nur lesen):</p>
          <ol class="note steps">
            <li>Im Sheet: Datei › Freigeben › Im Web veröffentlichen.</li>
            <li>Nur das Tabellenblatt mit den Wörtern wählen, Format „Kommagetrennte Werte (.csv)“.</li>
            <li>Veröffentlichen, den Link kopieren und hier einfügen.</li>
          </ol>
          <p class="warn">Wer diesen Link kennt, kann dieses eine Tabellenblatt lesen. Veröffentliche nur die Wörter, nie ein Blatt mit persönlichen Notizen.</p>
          <input class="text-in" type="url" inputmode="url" autocomplete="off" spellcheck={false} placeholder="https://docs.google.com/spreadsheets/d/e/…/pub?output=csv"
            value={url} onInput={(e) => setUrl((e.currentTarget as HTMLInputElement).value)} />
          <div class="btn-row"><button class="small-btn solid" type="button" disabled={!url.trim()} onClick={connect}>Verbinden</button></div>
          {msg ? <p class="note" role="status">{msg}</p> : null}
        </>
      )}

      {isSheet && (issues.length || info?.duplicates.length || info?.unknownColumns.length) ? (
        <>
          <p class="kicker">Zeilen mit Hinweisen</p>
          <p class="note">Die App nimmt, was sie verwenden kann. Diese Zeilen sind nicht ganz vollständig; alles andere läuft weiter.</p>
          <ul class="hard-list">
            {issues.slice(0, 30).map((i) => (
              <li key={`i${i.line}`}><div><span class="nm">Zeile {i.line}{i.de ? ` · ${i.de}` : ''}</span><br /><span class="ct">{i.skipped ? 'nicht übernommen: ' : ''}{i.notes.join(' · ')}</span></div></li>
            ))}
            {(info?.duplicates ?? []).slice(0, 10).map((d) => (
              <li key={`d${d.line}`}><div><span class="nm">Zeile {d.line} · {d.de}</span><br /><span class="ct">doppelt (wie Zeile {d.firstLine}), einmal übernommen</span></div></li>
            ))}
          </ul>
          {issues.length > 30 ? <p class="note">… und {issues.length - 30} weitere.</p> : null}
          {info?.unknownColumns.length ? <p class="note">Nicht verwendete Spalten (bleiben im Sheet): {info.unknownColumns.join(', ')}</p> : null}
        </>
      ) : null}

      {isSheet ? (
        <details class="more-set">
          <summary>Erweitert</summary>
          <div class="btn-row">
            <label class="small-btn"><Icon name="upload" size={18} />CSV-Datei einlesen<input type="file" accept=".csv,text/csv" class="sr-only" onChange={(e) => void importCsv((e.currentTarget as HTMLInputElement).files?.[0])} /></label>
            {linked ? <button class="small-btn" type="button" onClick={disconnect}>Sheet trennen</button> : null}
          </div>
        </details>
      ) : null}
    </>
  );
}
