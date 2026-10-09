import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { DataAdapter, KeyValueStore, Snapshot } from '@core/data/adapter.ts';
import { composeRun } from '@core/engine/run.ts';
import { dashboard } from '@core/engine/stats.ts';
import { parseSettings, type Settings } from '@core/engine/settings.ts';
import { mintId } from '@core/ids.ts';
import type { LearnEvent } from '@core/scheduler.ts';
import type { Ctx, Screen } from './appctx';
import { audio, setAudioSettings, unlockAudio } from './audio/browser';
import { randomBytes } from './data/source';
import { setHaptics } from './lib/haptics';
import { Run, type Grade, type RunState } from './run/Run';
import { End, Summary } from './screens/Summary';
import { SettingsScreen } from './screens/Settings';
import { Verlauf } from './screens/Verlauf';
import { applyAppearance, saveSettings } from './state/settings';
import { forcedCards } from './dev';

/**
 * The app shell. It opens straight into the first card of a run: nothing to choose, no count, no
 * start screen. Between runs: the summary, or the calm end. Verlauf and Einstellungen sit one tap away.
 */
export function App({ adapter, store, snapshot, settings: initial }: { adapter: DataAdapter; store: KeyValueStore; snapshot: Snapshot; settings: Settings }) {
  const [, bump] = useState(0);
  const data = useRef({ ...snapshot, eventIds: new Set(snapshot.events.map((e) => e.id)), events: [...snapshot.events], settings: initial });
  const rerender = () => bump((n) => n + 1);

  const ctx: Ctx = useMemo(() => ({
    adapter,
    store,
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
      applyAppearance(s);
      void saveSettings(store, s);
      rerender();
    },
    audio,
    record(e: LearnEvent) {
      data.current.events.push(e);
      adapter.appendEvents([e]).catch((err) => console.warn('answer not saved', err));
    },
    async reload() {
      const fresh = await adapter.load();
      data.current = { ...fresh, eventIds: new Set(fresh.events.map((e) => e.id)), events: [...fresh.events], settings: data.current.settings };
      rerender();
    },
  }), [adapter, store]);

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
          onFinish={(r) => { setResults(r); setScreen('summary'); }}
          onLeave={(r) => { setResults(r); setScreen(r.length ? 'summary' : 'end'); }}
          onExpire={newRun}
        />
      ) : null}
      {screen === 'summary' && run ? (
        <Summary ctx={ctx} no={run.no} results={results} onAgain={newRun} onDone={() => setScreen('end')} onVerlauf={() => go('verlauf')} />
      ) : null}
      {screen === 'end' ? <End nothing={nothing} onStart={newRun} onVerlauf={() => go('verlauf')} onSettings={() => go('settings')} /> : null}
      {screen === 'verlauf' ? <Verlauf ctx={ctx} onBack={leave} onPractice={practice} /> : null}
      {screen === 'settings' ? <SettingsScreen ctx={ctx} onBack={leave} /> : null}
    </>
  );
}
