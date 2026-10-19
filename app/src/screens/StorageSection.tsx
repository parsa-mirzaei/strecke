import { useEffect, useState } from 'preact/hooks';
import type { Ctx } from '../appctx';
import { formatDate, t, type StringKey } from '../i18n';
import { NS, CHANNEL } from '../ns';
import { dryRun, type DryRun } from '../storage/backup';
import { persistState, usageEstimate, type PersistState } from '../storage/persist';
import { dumpToBackupText, readSnapshots, snapshotInfo, type SnapshotInfo, type StoredSnapshot } from '../storage/snapshot';
import type { MigrationInfo } from '../storage/store';
import { Icon } from '../ui/Icon';

/** About 200 bytes per stored answer (event + key), measured in Round 4 (3.5 MB for 18 250 answers). */
const BYTES_PER_ANSWER = 200;
const DAY = 86_400_000;

const mb = (n: number) => t('store.mb', { n: (n / 1024 / 1024).toFixed(n < 10 * 1024 * 1024 ? 1 : 0) });

const STATE: Record<string, [StringKey, StringKey]> = {
  protected: ['store.protected', 'store.protectedNote'],
  'not-protected': ['store.notProtected', 'store.notProtectedNote'],
  unsupported: ['store.unknown', 'store.unknownNote'],
  memory: ['store.memory', 'store.memoryNote'],
};

/** Settings › Data › storage on this device, backup and restore (with a dry run before anything changes). */
export function StorageSection({ ctx }: { ctx: Ctx }) {
  const [persist, setPersist] = useState<PersistState | null>(ctx.device.persist);
  const [usage, setUsage] = useState<{ usage: number; quota: number } | null>(null);
  const [quarantined, setQuarantined] = useState(0);
  const [migration, setMigration] = useState<MigrationInfo | null>(null);
  const [plan, setPlan] = useState<Extract<DryRun, { ok: true }> | null>(null);
  const [withSettings, setWithSettings] = useState(true);
  const [msg, setMsg] = useState('');
  const [snaps, setSnaps] = useState<StoredSnapshot[]>([]);
  const log = ctx.adapter.kind === 'sheet' ? 'sheet' : 'demo';

  useEffect(() => {
    void readSnapshots(globalThis.indexedDB, NS).then(setSnaps).catch(() => setSnaps([]));
    void persistState().then(setPersist);
    void usageEstimate().then(setUsage);
    void ctx.app.quarantineCount().then(setQuarantined);
    void ctx.app.migration().then(setMigration);
  }, []);

  const recent = ctx.events.filter((e) => e.ts > Date.now() - 30 * DAY).length;
  const perYear = (recent / 30) * 365 * BYTES_PER_ANSWER;
  const [stateKey, noteKey] = STATE[ctx.app.durability === 'memory' ? 'memory' : persist ?? 'unsupported']!;

  async function backup() {
    const how = await ctx.backupNow();
    setMsg(how === 'shared' ? t('backup.shared') : how === 'downloaded' ? t('backup.downloaded') : '');
  }

  async function pick(file: File | undefined) {
    if (!file) return;
    preview(await file.text());
  }

  /** A snapshot goes through the same dry run as a backup file. */
  function pickSnapshot(snap: StoredSnapshot) {
    preview(dumpToBackupText(snap.dump, snap.at, CHANNEL, log).text);
  }

  function preview(text: string) {
    const d = dryRun(text, ctx.eventIds, ctx.settings);
    if (!d.ok) {
      setPlan(null);
      setMsg(t(`backup.err.${d.error}`));
      return;
    }
    setMsg('');
    setPlan(d);
    setWithSettings(d.settingsChanged.length > 0);
  }

  async function apply() {
    if (!plan) return;
    await ctx.restore(plan, withSettings);
    setMsg(t('backup.applied', { n: plan.fresh.length }));
    setPlan(null);
  }

  const details = [
    usage ? t('store.used', { mb: mb(usage.usage) }) : '',
    recent ? t('store.growth', { mb: mb(perYear) }) : t('store.perAnswer'),
    quarantined ? t('store.quarantined', { n: quarantined }) : '',
    migration && migration.events ? t('store.migrated', { n: migration.events }) : '',
  ].filter(Boolean).join(' ');
  const fromDate = plan?.exportedAt ? formatDate(Date.parse(plan.exportedAt)) : '';

  return (
    <>
      <p class="kicker">{t('store.here')}</p>
      <div class="field"><div class="lbl">{t('store.state', { state: t(stateKey) })}<small>{t(noteKey)}</small></div></div>
      <div class="field"><div class="lbl">{t('store.answers', { n: ctx.events.length })}<small>{details}</small></div></div>

      <p class="kicker">{t('backup.title')}</p>
      <div class="field">
        <div class="lbl">{ctx.device.lastBackupAt ? t('backup.last', { date: formatDate(ctx.device.lastBackupAt) }) : t('backup.never')}<small>{t('backup.lastNote')}</small></div>
      </div>
      <div class="field">
        <div class="lbl">{t('backup.create')}<small>{t('backup.note')}</small></div>
        <button class="small-btn solid" type="button" onClick={() => void backup()}><Icon name="download" size={18} />{t('backup.export')}</button>
      </div>
      <div class="field">
        <div class="lbl">{t('backup.restore')}<small>{t('backup.restoreNote')}</small></div>
        <label class="small-btn"><Icon name="upload" size={18} />{t('backup.import')}<input type="file" accept=".txt,.json,text/plain,application/json" class="sr-only" onChange={(e) => void pick((e.currentTarget as HTMLInputElement).files?.[0])} /></label>
      </div>
      <div class="field">
        <div class="lbl">{t('snap.title')}<small>{snaps.length ? t('snap.note') : t('snap.none')}</small></div>
      </div>
      {snaps.length ? (
        <ul class="snap-list">
          {snaps.map((sn) => snapshotInfo(sn, log)).map((info: SnapshotInfo, i) => (
            <li key={info.id}>
              <span>{t('snap.item', { date: formatDate(info.at) })}<small>{t('snap.itemNote', { n: info.answers, from: info.from, to: info.to })}</small></span>
              <button class="small-btn" type="button" onClick={() => pickSnapshot(snaps[i]!)}>{t('snap.restore')}</button>
            </li>
          ))}
        </ul>
      ) : null}
      {plan ? (
        <div class="hint-box" role="region" aria-label={t('backup.preview')}>
          <p class="note"><b>{t('backup.previewTitle')}</b> {fromDate ? (plan.channel !== 'stable' ? t('backup.fromChannel', { date: fromDate, channel: plan.channel }) : t('backup.from', { date: fromDate })) : ''}</p>
          <ul class="plain-list">
            <li>{t('backup.inFile', { n: plan.answers })}</li>
            <li>{t('backup.fresh', { n: plan.fresh.length })}</li>
            <li>{t('backup.already', { n: plan.already })}</li>
            {plan.skipped ? <li>{t('backup.skipped', { n: plan.skipped })}</li> : null}
          </ul>
          {plan.settingsChanged.length ? (
            <label class="check"><input type="checkbox" checked={withSettings} onChange={(e) => setWithSettings((e.currentTarget as HTMLInputElement).checked)} /> {t('backup.withSettings', { n: plan.settingsChanged.length })}</label>
          ) : null}
          <p class="note">{t('backup.mergeOnly')}</p>
          <div class="btn-row">
            <button class="small-btn solid" type="button" onClick={() => void apply()}>{t('backup.apply')}</button>
            <button class="small-btn" type="button" onClick={() => setPlan(null)}>{t('common.cancel')}</button>
          </div>
        </div>
      ) : null}
      {msg ? <p class="note" role="status">{msg}</p> : null}
    </>
  );
}
