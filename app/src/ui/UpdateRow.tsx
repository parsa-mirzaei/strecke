import { useEffect, useState } from 'preact/hooks';
import type { Ctx } from '../appctx';
import { t } from '../i18n';
import { updater } from '../state/update';
import { Icon } from './Icon';

/**
 * A calm row when a new version is ready. Only on the end screen and in Settings, never during a run;
 * applying it saves pending answers first, then reloads once.
 */
export function UpdateRow({ ctx }: { ctx: Ctx }) {
  const [waiting, setWaiting] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => updater?.subscribe(setWaiting), []);
  if (!waiting) return null;
  async function apply() {
    setBusy(true);
    await ctx.flush();
    updater?.apply();
  }
  return (
    <div class="update-row" role="status">
      <span><b>{t('update.title')}</b><small>{t('update.note')}</small></span>
      <button class="small-btn" type="button" disabled={busy} onClick={() => void apply()}><Icon name="refresh-cw" size={18} />{t('update.apply')}</button>
    </div>
  );
}
