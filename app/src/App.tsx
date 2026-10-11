import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { DataAdapter, Snapshot } from '@core/data/adapter.ts';
import { SheetAdapter, type OptionalTabs, type TableSource } from '@core/data/sheet.ts';
import { composeRun } from '@core/engine/run.ts';
import { dashboard } from '@core/engine/stats.ts';
import { parseSettings, type Settings } from '@core/engine/settings.ts';
import { mintId } from '@core/ids.ts';
import type { LearnEvent } from '@core/scheduler.ts';
import type { Ctx, Screen } from './appctx';
import { audio, setAudioSettings, unlockAudio } from './audio/browser';
import { randomBytes } from './data/source';
import { setHaptics } from './lib/haptics';
import { setLocale, t } from './i18n';
import { CHANNEL } from './ns';
import { Run, type Grade, type RunState } from './run/Run';
import { End, Summary } from './screens/Summary';
import { SettingsScreen } from './screens/Settings';
import { Verlauf } from './screens/Verlauf';
import { saveDevice, type DeviceInfo } from './state/device';
import { applyAppearance, saveSettings } from './state/settings';
import { buildBackup, deliver } from './storage/backup';
import { requestPersist, shouldAskPersist } from './storage/persist';
import type { AppStore } from './storage/store';
import { forcedCards } from './dev';

/**
 * The app shell. It opens straight into the first card of a run: nothing to choose, no count, no
 * start screen. Between runs: the summary, or the calm end. Verlauf and Einstellungen sit one tap away.
 * The answers of a run are kept in memory and saved together, in one transaction, when the run ends
 * or the app is hidden; leaving a run midway costs nothing.
 */
export function App({ adapter, app, snapshot, settings: initial, device: initialDevice, source = null, tabs = {} }: {
  adapter: DataAdapter; app: AppStore; snapshot: Snapshot; settings: Settings; device: DeviceInfo; source?: TableSource | null; tabs?: OptionalTabs;
}) {
  const [, bump] = useState(0);
  const data = useRef({
    ...snapshot, eventIds: new Set(snapshot.events.map((e) => e.id)), events: [...snapshot.events], settings: initial, device: initialDevice, notice: '',
  });
  const pending = useRef<LearnEvent[]>([]);
  const askedPersist = useRef(false);
  const rerender = () => bump((n) => n + 1);

  const ctx: Ctx = useMemo(() => ({
    adapter,
    app,
    get words() { return data.current.words; },
    get suspended() { return data.current.suspended; },
    get config() { return data.current.config; },
    get events() { return data.current.events; },
    get eventIds() { return data.current.eventIds; },
    get settings() { return data.current.settings; },
    setSettings(next: Settings) {
      const s = parseSettings(next);
      data.current.settings = s;
      setAudioSettings(s.audio);
      setHaptics(s.haptics);
      if (!(import.meta.env.DEV && new URLSearchParams(location.search).has('lang'))) setLocale(s.locale);
      applyAppearance(s);
      void saveSettings(app.kv, s);
      rerender();
    },
    audio,
    record(e: LearnEvent) {
      data.current.events.push(e);
      pending.current.push(e);
    },
    async flush() {
      if (!pending.current.length) return;
      const batch = pending.current;
      pending.current = [];
      try {
        await adapter.appendEvents(batch);
      } catch (err) {
        pending.current = [...batch, ...pending.current]; // kept for the next try, never dropped
        console.warn('answers not saved yet', err);
      }
    },
    async discardRun(runId: string) {
      await ctx.flush();
      const ids = data.current.events.filter((e) => e.run === runId).map((e) => e.id);
      data.current.events = data.current.events.filter((e) => e.run !== runId);
      ids.forEach((id) => data.current.eventIds.delete(id));
      await adapter.removeEvents?.(ids);
      const d = data.current.device;
      if (d.completedRuns > 0) ctx.setDevice({ completedRuns: d.completedRuns - 1, runsSinceBackup: Math.max(0, d.runsSinceBackup - 1) });
      rerender();
    },
    async runCompleted() {
      await ctx.flush();
      const d = data.current.device;
      ctx.setDevice({ completedRuns: d.completedRuns + 1, runsSinceBackup: d.runsSinceBackup + 1 });
      if (shouldAskPersist(d.completedRuns + 1, d.persist ?? 'not-protected', askedPersist.current)) {
        askedPersist.current = true;
        ctx.setDevice({ persist: await requestPersist() });
      }
    },
    get device() { return data.current.device; },
    setDevice(patch: Partial<DeviceInfo>) {
      data.current.device = { ...data.current.device, ...patch };
      void saveDevice(app.kv, data.current.device);
      rerender();
    },
    async backupNow() {
      await ctx.flush();
      const how = await deliver(buildBackup(data.current.settings, data.current.events, Date.now(), CHANNEL));
      if (how !== 'cancelled') ctx.setDevice({ lastBackupAt: Date.now(), runsSinceBackup: 0, backupHintShown: true });
      return how;
    },
    async restore(d, withSettings) {
      await ctx.flush();
      if (d.fresh.length) await adapter.appendEvents(d.fresh);
      const sheetChanged = withSettings && JSON.stringify(d.settings.sheet) !== JSON.stringify(data.current.settings.sheet);
      if (withSettings) ctx.setSettings(d.settings);
      if (sheetChanged) { location.reload(); return; }
      await ctx.reload();
    },
    get notice() { return data.current.notice; },
    setNotice(text: string) { data.current.notice = text; rerender(); },
    async reload() {
      await ctx.flush();
      const fresh = await adapter.load();
      data.current = { ...data.current, ...fresh, eventIds: new Set(fresh.events.map((e) => e.id)), events: [...fresh.events] };
      rerender();
    },
    get sourceInfo() { return data.current.source; },
    source,
    async sync(from?: TableSource) {
      const src = from ?? source;
      if (!src || !(adapter instanceof SheetAdapter)) return { ok: false, error: 'no_sheet' };
      const res = await adapter.sync(src, from ? {} : tabs);
      await ctx.reload();
      return res;
    },
  }), [adapter, app, source, tabs]);

  // Hidden (another app, the lock screen): save what has been answered.
  useEffect(() => {
    const save = () => { if (document.visibilityState === 'hidden') void ctx.flush(); };
    document.addEventListener('visibilitychange', save);
    addEventListener('pagehide', save);
    return () => { document.removeEventListener('visibilitychange', save); removeEventListener('pagehide', save); };
  }, []);

  // Background sync on open and on every return to the app (online, at most once a minute): practice
  // starts from the device's copy; new or edited rows arrive quietly and are used from the next run on.
  // New words get one calm line on the end screen.
  useEffect(() => {
    if (!source) return;
    let last = 0;
    const pull = async () => {
      if (!navigator.onLine || Date.now() - last < 60_000) return;
      last = Date.now();
      const r = await ctx.sync();
      const n = r.ok ? r.report?.added.length ?? 0 : 0;
      if (n) ctx.setNotice(n === 1 ? t('notice.newWord') : t('notice.newWords', { n }));
    };
    const onShow = () => { if (document.visibilityState === 'visible') void pull(); };
    void pull();
    document.addEventListener('visibilitychange', onShow);
    return () => document.removeEventListener('visibilitychange', onShow);
  }, []);

  setAudioSettings(ctx.settings.audio);
  setHaptics(ctx.settings.haptics);

  if (import.meta.env.DEV) Object.assign(window, { __words: ctx.words, __events: ctx.events }); // design-review tooling only
  const focus = useRef<string[]>([]);

  function startRun(): RunState | null {
    const now = Date.now();
    const forced = import.meta.env.DEV ? forcedCards(ctx.words) : [];
    const cards = forced.length ? forced : composeRun({
      words: ctx.words, events: ctx.events, settings: ctx.settings, config: ctx.config, now,
      seed: `${now}-${Math.random()}`, canListen: ctx.audio.canListen(), focus: focus.current,
    });
    focus.current = [];
    if (!cards.length) return null;
    const today = dashboard({ words: ctx.words, events: ctx.events, settings: ctx.settings, now, retention: ctx.config.retention }).today.runs;
    return { id: mintId('r', new Set(), randomBytes), no: today + 1, cards };
  }

  // The first run is composed before the first paint, from the device's own data.
  const [first] = useState(startRun);
  const [run, setRun] = useState<RunState | null>(first);
  const [screen, setScreen] = useState<Screen>(first ? 'run' : 'end');
  const [back, setBack] = useState<Screen>('end');
  const [results, setResults] = useState<Grade[]>([]);
  const nothing = ctx.words.filter((w) => w.status === 'active').length === 0;

  // Android's back button walks back through the screens instead of leaving the app.
  useEffect(() => {
    const onPop = () => setScreen((s) => (s === 'verlauf' || s === 'settings' ? back : s));
    addEventListener('popstate', onPop);
    return () => removeEventListener('popstate', onPop);
  }, [back]);

  function go(next: Screen) {
    setBack(screen === 'run' ? 'end' : screen);
    history.pushState({ s: next }, '');
    setScreen(next);
  }
  function leave() {
    if (history.state?.s) history.back();
    else setScreen(back);
  }

  function newRun() {
    unlockAudio();
    const r = startRun();
    setRun(r);
    setResults([]);
    setScreen(r ? 'run' : 'end');
  }

  function practice(ids: string[]) {
    focus.current = ids;
    if (history.state?.s) history.back();
    newRun();
  }

  return (
    <>
      {screen === 'run' && run ? (
        <Run
          key={run.id}
          ctx={ctx}
          run={run}
          onFinish={(r) => { setResults(r); setScreen('summary'); void ctx.runCompleted(); }}
          onLeave={(r) => { setResults(r); setScreen(r.length ? 'summary' : 'end'); if (r.length) void ctx.runCompleted(); }}
          onExpire={() => { void ctx.runCompleted(); newRun(); }}
        />
      ) : null}
      {screen === 'summary' && run ? (
        <Summary
          ctx={ctx} no={run.no} results={results} onAgain={newRun} onDone={() => setScreen('end')} onVerlauf={() => go('verlauf')}
          onDiscard={async () => { await ctx.discardRun(run.id); ctx.setNotice('discarded'); setScreen('end'); }}
          onBackup={() => go('settings')}
        />
      ) : null}
      {screen === 'end' ? <End ctx={ctx} nothing={nothing} onStart={newRun} onVerlauf={() => go('verlauf')} onSettings={() => go('settings')} /> : null}
      {screen === 'verlauf' ? <Verlauf ctx={ctx} onBack={leave} onPractice={practice} /> : null}
      {screen === 'settings' ? <SettingsScreen ctx={ctx} onBack={leave} /> : null}
    </>
  );
}
