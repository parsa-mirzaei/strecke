import { useEffect, useState } from 'preact/hooks';
import type { Ctx } from '../appctx';
import { dryRun, type DryRun } from '../storage/backup';
import { persistState, usageEstimate, type PersistState } from '../storage/persist';
import type { MigrationInfo } from '../storage/store';
import { Icon } from '../ui/Icon';

/** About 200 bytes per stored answer (event + key), measured in Round 4 (3.5 MB for 18 250 answers). */
const BYTES_PER_ANSWER = 200;
const DAY = 86_400_000;

const mb = (n: number) => `${(n / 1024 / 1024).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`;
const date = (t: number | null) => (t ? new Date(t).toLocaleDateString('de-DE', { day: 'numeric', month: 'short', year: 'numeric' }) : '');

/** Settings › Data › storage on this device, backup and restore (with a dry run before anything changes). */
export function StorageSection({ ctx }: { ctx: Ctx }) {
  const [persist, setPersist] = useState<PersistState | null>(ctx.device.persist);
  const [usage, setUsage] = useState<{ usage: number; quota: number } | null>(null);
  const [quarantined, setQuarantined] = useState(0);
  const [migration, setMigration] = useState<MigrationInfo | null>(null);
  const [plan, setPlan] = useState<Extract<DryRun, { ok: true }> | null>(null);
  const [withSettings, setWithSettings] = useState(true);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    void persistState().then(setPersist);
    void usageEstimate().then(setUsage);
    void ctx.app.quarantineCount().then(setQuarantined);
    void ctx.app.migration().then(setMigration);
  }, []);

  const recent = ctx.events.filter((e) => e.ts > Date.now() - 30 * DAY).length;
  const perYear = (recent / 30) * 365 * BYTES_PER_ANSWER;
  const state = ctx.app.durability === 'memory' ? 'memory' : persist ?? 'unsupported';
  const stateText: Record<string, [string, string]> = {
    protected: ['geschützt', 'Der Browser löscht die Daten dieser App nur, wenn du es selbst tust.'],
    'not-protected': ['nicht geschützt', 'Der Browser darf die Daten bei Speichermangel löschen. Eine Sicherung schützt deinen Verlauf. Nach weiteren Runden fragt die App noch einmal.'],
    unsupported: ['unbekannt', 'Dieser Browser sagt nicht, ob er die Daten schützt. Eine Sicherung schützt deinen Verlauf.'],
    memory: ['nur dieser Besuch', 'Dieser Browser lässt kein Speichern zu (privates Fenster?). Was du übst, ist beim Schließen weg.'],
  };

  async function backup() {
    const how = await ctx.backupNow();
    setMsg(how === 'shared' ? 'Sicherung geteilt.' : how === 'downloaded' ? 'Sicherung heruntergeladen.' : '');
  }

  async function pick(file: File | undefined) {
    if (!file) return;
    const d = dryRun(await file.text(), ctx.eventIds, ctx.settings);
    if (!d.ok) {
      setPlan(null);
      setMsg(d.error === 'not_json' ? 'Diese Datei ist keine Sicherung.' : d.error === 'unknown_version' ? 'Diese Sicherung stammt aus einer neueren Version.' : 'Diese Datei ist keine Strecke-Sicherung.');
      return;
    }
    setMsg('');
    setPlan(d);
    setWithSettings(d.settingsChanged.length > 0);
  }

  async function apply() {
    if (!plan) return;
    await ctx.restore(plan, withSettings);
    setMsg(`${plan.fresh.length} Antworten übernommen.`);
    setPlan(null);
  }

  return (
    <>
      <p class="kicker">Auf diesem Gerät</p>
      <div class="field">
        <div class="lbl">Speicher: {stateText[state]![0]}<small>{stateText[state]![1]}</small></div>
      </div>
      <div class="field">
        <div class="lbl">
          {ctx.events.length} Antworten gespeichert
          <small>
            {usage ? `Belegt: ${mb(usage.usage)}. ` : ''}
            {recent ? `Bei deinem Tempo etwa ${mb(perYear)} pro Jahr.` : 'Pro Antwort etwa 0,2 KB.'}
            {quarantined ? ` ${quarantined} beschädigte Einträge beiseitegelegt (nicht gelöscht).` : ''}
            {migration && migration.events ? ` Beim Umstieg auf die neue Speicherung übernommen: ${migration.events} Antworten.` : ''}
          </small>
        </div>
      </div>

      <p class="kicker">Sicherung</p>
      <div class="field">
        <div class="lbl">{ctx.device.lastBackupAt ? `Letzte Sicherung: ${date(ctx.device.lastBackupAt)}` : 'Noch keine Sicherung'}<small>Eine Datei mit allen Antworten und Einstellungen. Der Audio-Schlüssel ist nicht enthalten.</small></div>
      </div>
      <div class="btn-row">
        <button class="small-btn solid" type="button" onClick={() => void backup()}><Icon name="download" size={18} />Sicherung erstellen</button>
        <label class="small-btn"><Icon name="upload" size={18} />Wiederherstellen<input type="file" accept=".txt,.json,text/plain,application/json" class="sr-only" onChange={(e) => void pick((e.currentTarget as HTMLInputElement).files?.[0])} /></label>
      </div>
      {plan ? (
        <div class="hint-box" role="region" aria-label="Vorschau der Wiederherstellung">
          <p class="note"><b>Vorschau, noch nichts geändert.</b> {plan.exportedAt ? `Sicherung vom ${date(Date.parse(plan.exportedAt))}` : ''}{plan.channel !== 'stable' ? ` (${plan.channel})` : ''}.</p>
          <ul class="plain-list">
            <li>{plan.answers} Antworten in der Datei</li>
            <li>{plan.fresh.length} davon neu für dieses Gerät</li>
            <li>{plan.already} schon vorhanden</li>
            {plan.skipped ? <li>{plan.skipped} nicht lesbar, werden ausgelassen</li> : null}
          </ul>
          {plan.settingsChanged.length ? (
            <label class="check"><input type="checkbox" checked={withSettings} onChange={(e) => setWithSettings((e.currentTarget as HTMLInputElement).checked)} /> Einstellungen übernehmen ({plan.settingsChanged.length} anders als hier)</label>
          ) : null}
          <p class="note">Es wird nur ergänzt, nichts gelöscht.</p>
          <div class="btn-row">
            <button class="small-btn solid" type="button" onClick={() => void apply()}>Übernehmen</button>
            <button class="small-btn" type="button" onClick={() => setPlan(null)}>Abbrechen</button>
          </div>
        </div>
      ) : null}
      {msg ? <p class="note" role="status">{msg}</p> : null}
    </>
  );
}
