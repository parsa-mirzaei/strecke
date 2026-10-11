/** Settings › Data: storage protection, backup and restore (DECISIONS D50, D51). */
import { useEffect, useRef, useState } from 'preact/hooks';
import {
  backupFileName, createBackup, dryRun, parseBackup, restoreBackup, shareOrDownload, type BackupMeta, type ParsedBackup,
  type RestorePlan,
} from '../../storage/backup';
import { persistState, usageEstimate, type PersistState } from '../../storage/persist';
import type { Store } from '../../storage/store';
import { CHANNEL } from '../../channel';
import { formatBytes, formatDate, t, type StringKey } from '../../i18n';
import { DownloadIcon, UploadIcon } from '../icons';

interface Props {
  store: Store;
  quarantined: number;
  onRestored: () => void;
}

const PERSIST_KEY: Record<PersistState, StringKey> = {
  protected: 'storage.protected',
  'not-protected': 'storage.notProtected',
  unsupported: 'storage.unknown',
};
const PERSIST_EXPLAIN: Record<PersistState, StringKey> = {
  protected: 'storage.explainProtected',
  'not-protected': 'storage.explainNotProtected',
  unsupported: 'storage.explainUnknown',
};

export function DataBackup({ store, quarantined, onRestored }: Props) {
  const [persist, setPersist] = useState<PersistState | null>(null);
  const [usage, setUsage] = useState<number | null>(null);
  const [meta, setMeta] = useState<BackupMeta>({ lastAt: null, hintShown: false });
  const [status, setStatus] = useState('');
  const [pending, setPending] = useState<{ parsed: Extract<ParsedBackup, { ok: true }>; plan: RestorePlan } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    persistState().then(setPersist);
    usageEstimate().then((u) => setUsage(u?.usage ?? null));
    store.get<BackupMeta>('backup').then((m) => m && setMeta(m));
  }, []);

  const backUp = async () => {
    const now = Date.now();
    const file = JSON.stringify(await createBackup(store, CHANNEL, now));
    const how = await shareOrDownload(file, backupFileName(now));
    if (how === 'cancelled') return setStatus(t('backup.cancelled'));
    const next = { ...meta, lastAt: now };
    await store.setMany({ backup: next, runs: { ...((await store.get<object>('runs')) ?? { completed: 0 }), sinceBackup: 0 } });
    setMeta(next);
    setStatus(t(how === 'shared' ? 'backup.shared' : 'backup.downloaded'));
  };

  const pickFile = async (e: Event) => {
    const input = e.target as HTMLInputElement;
    const f = input.files?.[0];
    input.value = '';
    if (!f) return;
    const parsed = parseBackup(await f.text());
    if (!parsed.ok) {
      setPending(null);
      return setStatus(t(`restore.problem.${parsed.problem}` as StringKey));
    }
    setStatus('');
    setPending({ parsed, plan: await dryRun(store, parsed) });
  };

  const confirmRestore = async () => {
    if (!pending) return;
    const added = await restoreBackup(store, pending.parsed);
    setPending(null);
    setStatus(t('restore.done', { n: added }));
    onRestored();
  };

  const plan = pending?.plan;
  return (
    <>
      <dl class="facts">
        <dt>{t('storage.label')}</dt>
        <dd>
          {store.durability === 'memory' ? t('storage.memory') : persist ? t(PERSIST_KEY[persist]) : '…'}
        </dd>
      </dl>
      <p class="explain">
        {store.durability === 'memory' ? t('storage.explainMemory') : persist ? t(PERSIST_EXPLAIN[persist]) : ''}
      </p>
      {usage !== null && <p class="explain">{t('storage.used', { size: formatBytes(usage) })}</p>}
      {quarantined > 0 && <p class="explain">{t('storage.damaged', { n: quarantined })}</p>}

      <dl class="facts">
        <dt>{t('backup.lastLabel')}</dt>
        <dd>{meta.lastAt ? formatDate(meta.lastAt) : t('backup.never')}</dd>
      </dl>
      <div class="stack">
        <button type="button" class="secondary" onClick={backUp}>
          <DownloadIcon />
          <span>{t('backup.now')}</span>
        </button>
        <button type="button" class="secondary" onClick={() => fileRef.current?.click()}>
          <UploadIcon />
          <span>{t('restore.button')}</span>
        </button>
        <input ref={fileRef} type="file" accept=".txt,.json,text/plain,application/json" hidden onChange={pickFile} />
      </div>
      {status && <p class="status" role="status">{status}</p>}
      {plan && (
        <div class="plan" role="region" aria-label={t('restore.button')}>
          <p>{t('restore.plan', { date: plan.createdAt ? formatDate(Date.parse(plan.createdAt)) : '?', total: plan.eventsInFile, fresh: plan.newEvents, here: plan.alreadyHere })}</p>
          {plan.damaged > 0 && <p>{t('restore.damaged', { n: plan.damaged })}</p>}
          {plan.newSettings.length > 0 && <p>{t('restore.settings', { n: plan.newSettings.length })}</p>}
          <p class="explain">{t('restore.never')}</p>
          <div class="row">
            <button type="button" class="secondary" onClick={() => setPending(null)}>{t('common.cancel')}</button>
            <button type="button" class="primary" disabled={plan.newEvents === 0 && plan.newSettings.length === 0} onClick={confirmRestore}>
              {plan.newEvents === 0 && plan.newSettings.length === 0 ? t('restore.nothing') : t('restore.confirm')}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
