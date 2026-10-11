import { dashboard } from '@core/engine/stats.ts';
import type { Ctx } from '../appctx';
import { formatTime, t } from '../i18n';
import { Route, type Grade } from '../run/Run';
import { shouldHintBackup } from '../storage/backup';
import { Icon } from '../ui/Icon';

function Stat({ label, value, cls }: { label: string; value: number; cls?: string }) {
  return <div class={cls}><dt>{label}</dt><dd>{value}</dd></div>;
}

/** Where the words come from: "Demo words" or "Your sheet · N words · synced <time>". */
export function SourceLine({ ctx, onConnect }: { ctx: Ctx; onConnect: () => void }) {
  if (ctx.adapter.kind !== 'sheet') {
    return (
      <p class="source-line">
        <span>{t('source.demo')}</span>
        <button class="quiet link-btn" type="button" onClick={onConnect}>{t('source.connect')}</button>
      </p>
    );
  }
  const synced = ctx.sourceInfo?.lastSync;
  return <p class="source-line"><span>{synced ? t('source.sheet', { n: ctx.words.length, time: formatTime(synced) }) : t('source.sheetNoSync', { n: ctx.words.length })}</span></p>;
}

/** After a run: what the day adds up to. Numbers come from the event log only. The run is already saved. */
export function Summary({ ctx, no, results, onAgain, onDone, onVerlauf, onDiscard, onBackup }: {
  ctx: Ctx; no: number; results: Grade[]; onAgain: () => void; onDone: () => void; onVerlauf: () => void; onDiscard: () => void; onBackup: () => void;
}) {
  const d = dashboard({ words: ctx.words, events: ctx.events, settings: ctx.settings, now: Date.now(), retention: ctx.config.retention });
  const hint = shouldHintBackup(ctx.device.runsSinceBackup, ctx.device.backupHintShown);
  return (
    <>
      <header class="top">
        <div class="row"><span class="run">{t('run.no', { no })}</span><span /></div>
        <Route n={results.length} cur={-1} results={results} />
      </header>
      <main class="sum enter">
        <h1>{t('sum.title', { no })}</h1>
        <p class="kicker">{t('sum.today')}</p>
        <dl class="stats">
          <Stat label={t('stat.runs')} value={d.today.runs} />
          <Stat label={t('stat.cards')} value={d.today.cards} />
          <Stat label={t('stat.secured')} value={d.today.secured} cls="sec" />
        </dl>
        {d.goal ? <p class="note" style={{ marginTop: '16px' }}>{t('sum.goal', { done: d.goal.done, target: d.goal.target })}</p> : null}
        {ctx.notice && ctx.notice !== 'discarded' ? <p class="note" role="status">{ctx.notice}</p> : null}
        <button class="link" type="button" onClick={onVerlauf}>{t('sum.verlauf')}</button>
        {hint ? (
          <div class="hint-box">
            <p class="note">{t('sum.backupHint')}</p>
            <div class="btn-row">
              <button class="small-btn" type="button" onClick={() => { ctx.setDevice({ backupHintShown: true }); onBackup(); }}>{t('sum.backupNow')}</button>
              <button class="small-btn" type="button" onClick={() => ctx.setDevice({ backupHintShown: true })}>{t('sum.notNow')}</button>
            </div>
          </div>
        ) : null}
        <button class="quiet discard" type="button" onClick={onDiscard}>{t('sum.discard')}</button>
      </main>
      <footer class="act enter">
        <button class="primary" type="button" onClick={onAgain}>{t('sum.again')}</button>
        <button class="ghost" type="button" onClick={onDone}>{t('common.done')}</button>
      </footer>
    </>
  );
}

/** The calm end: nothing pending, one way back in, the other screens one tap away. */
export function End({ ctx, nothing, onStart, onVerlauf, onSettings }: { ctx: Ctx; nothing: boolean; onStart: () => void; onVerlauf: () => void; onSettings: () => void }) {
  const notice = ctx.notice === 'discarded' ? t('end.discarded') : ctx.notice;
  return (
    <>
      <main class="end enter">
        <h1>{nothing ? t('end.nothingTitle') : t('end.title')}</h1>
        <p>{nothing ? t('end.nothingText') : t('end.text')}</p>
        {notice ? <p class="note" role="status">{notice}</p> : null}
        <SourceLine ctx={ctx} onConnect={onSettings} />
      </main>
      <footer class="act enter">
        {!nothing ? <button class="primary" type="button" onClick={onStart}>{t('end.start')}</button> : null}
        <div class="nav">
          <button class="quiet" type="button" onClick={onVerlauf}><Icon name="chart-no-axes-column" size={20} />{t('nav.verlauf')}</button>
          <button class="quiet" type="button" onClick={onSettings}><Icon name="settings" size={20} />{t('nav.settings')}</button>
        </div>
      </footer>
    </>
  );
}
