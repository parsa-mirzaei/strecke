import { dashboard } from '@core/engine/stats.ts';
import type { Ctx } from '../appctx';
import { Route, type Grade } from '../run/Run';
import { shouldHintBackup } from '../storage/backup';
import { Icon } from '../ui/Icon';

function Stat({ label, value, cls }: { label: string; value: number; cls?: string }) {
  return <div class={cls}><dt>{label}</dt><dd>{value}</dd></div>;
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
        <div class="row"><span class="run">Runde {no}</span><span /></div>
        <Route n={results.length} cur={-1} results={results} />
      </header>
      <main class="sum enter">
        <h1>Das war Runde {no}.</h1>
        <p class="kicker">Heute</p>
        <dl class="stats">
          <Stat label="Runden" value={d.today.runs} />
          <Stat label="Karten" value={d.today.cards} />
          <Stat label="Wörter sicherer" value={d.today.secured} cls="sec" />
        </dl>
        {d.goal ? <p class="note" style={{ marginTop: '16px' }}>Diese Woche: <b>{d.goal.done}</b> von {d.goal.target} Runden</p> : null}
        <button class="link" type="button" onClick={onVerlauf}>Verlauf ansehen</button>
        {hint ? (
          <div class="hint-box">
            <p class="note">Eine Sicherung auf deinem Telefon schützt deinen Verlauf, falls die App-Daten einmal gelöscht werden.</p>
            <div class="btn-row">
              <button class="small-btn" type="button" onClick={() => { ctx.setDevice({ backupHintShown: true }); onBackup(); }}>Jetzt sichern</button>
              <button class="small-btn" type="button" onClick={() => ctx.setDevice({ backupHintShown: true })}>Nicht jetzt</button>
            </div>
          </div>
        ) : null}
        <button class="quiet discard" type="button" onClick={onDiscard}>Diese Runde nicht zählen</button>
      </main>
      <footer class="act enter">
        <button class="primary" type="button" onClick={onAgain}>Noch eine Runde</button>
        <button class="ghost" type="button" onClick={onDone}>Fertig</button>
      </footer>
    </>
  );
}

/** The calm end: nothing pending, one way back in, the other screens one tap away. */
export function End({ ctx, nothing, onStart, onVerlauf, onSettings }: { ctx: Ctx; nothing: boolean; onStart: () => void; onVerlauf: () => void; onSettings: () => void }) {
  const notice = ctx.notice === 'discarded' ? 'Die Runde zählt nicht. Ihre Antworten wurden entfernt.' : ctx.notice;
  return (
    <>
      <main class="end enter">
        <h1>{nothing ? 'Noch nichts zu üben.' : 'Bis gleich.'}</h1>
        {nothing ? <p>Es gibt noch keine Wörter, die du üben kannst. Unter Einstellungen · Daten siehst du, woher die Wörter kommen.</p> : <p>Du kannst jederzeit weitermachen. Es wartet nichts auf dich.</p>}
        {notice ? <p class="note" role="status">{notice}</p> : null}
      </main>
      <footer class="act enter">
        {!nothing ? <button class="primary" type="button" onClick={onStart}>Neue Runde</button> : null}
        <div class="nav">
          <button class="quiet" type="button" onClick={onVerlauf}><Icon name="chart-no-axes-column" size={20} />Verlauf</button>
          <button class="quiet" type="button" onClick={onSettings}><Icon name="settings" size={20} />Einstellungen</button>
        </div>
      </footer>
    </>
  );
}
