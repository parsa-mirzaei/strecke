import { useState } from 'preact/hooks';
import { t } from '../i18n';
import { CHANNEL, NS } from '../ns';
import { backupName, deliver } from '../storage/backup';
import { dumpDatabase, dumpToBackupText } from '../storage/snapshot';
import { Icon } from '../ui/Icon';

/**
 * Shown instead of the app when this device's data was written by a newer version (version guard,
 * RELEASES.md). Nothing is opened for writing; the data can still be exported as a backup file.
 */
export function NewerData({ stored, known }: { stored: number; known: number }) {
  const [msg, setMsg] = useState('');

  async function exportNow() {
    try {
      const { dump } = await dumpDatabase(indexedDB, NS);
      const now = Date.now();
      const { text, answers } = dumpToBackupText(dump, now, CHANNEL);
      const how = await deliver({ name: backupName(now), text, answers });
      setMsg(how === 'shared' ? t('backup.shared') : how === 'downloaded' ? t('backup.downloaded') : '');
    } catch {
      setMsg(t('newer.exportFailed'));
    }
  }

  return (
    <>
      <main class="end enter">
        <h1>{t('newer.title')}</h1>
        <p>{t('newer.text')}</p>
        <p class="note">{t('newer.versions', { stored, known })}</p>
        {msg ? <p class="note" role="status">{msg}</p> : null}
      </main>
      <footer class="act enter">
        <button class="primary" type="button" onClick={() => void exportNow()}><Icon name="download" size={20} />{t('newer.export')}</button>
        <button class="ghost" type="button" onClick={() => location.reload()}>{t('newer.reload')}</button>
      </footer>
    </>
  );
}
