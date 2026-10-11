/**
 * The app shell: practice (home), settings, and the calm end of a visit. The engine runs on the
 * device's event log; the content comes from the demo deck or the learner's sheet (D49).
 */
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { DEFAULT_CONFIG, newSession, type Pick } from '../../core/src/scheduler.ts';
import type { WordRecord } from '../../core/src/record.ts';
import { speech, type VoiceStatus } from './audio/tts';
import { Practice, type Answer } from './engine/practice';
import { t } from './i18n';
import type { Boot } from './state/boot';
import { applySettings, type Settings as Prefs } from './state/settings';
import { shouldShowBackupHint, type BackupMeta, type RunsMeta } from './storage/backup';
import { persistState, requestPersist, shouldAskPersist } from './storage/persist';
import { Card } from './ui/Card';
import { SettingsIcon } from './ui/icons';
import { Settings } from './ui/settings/Settings';
import type { ContentView } from './state/content';

type Screen = 'practice' | 'settings' | 'done';

function useVoice(): VoiceStatus {
  const [status, setStatus] = useState<VoiceStatus>(speech.status);
  useEffect(() => speech.subscribe(setStatus), []);
  return status;
}

/** Overlays sit on top of practice; the Android back button closes them. */
function useScreen(): [Screen, (s: Screen) => void] {
  const [screen, set] = useState<Screen>('practice');
  useEffect(() => {
    const onPop = () => set('practice');
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  const go = (s: Screen) => {
    if (s === 'settings') history.pushState({ screen: s }, '');
    else if (screen === 'settings' && s === 'practice') {
      history.back();
      return;
    }
    set(s);
  };
  return [screen, go];
}

export interface AppProps {
  boot: Boot;
  content: ContentView;
  /** Rendered into Settings › Data and Settings › Fill my list (slices 3 and 4). */
  dataSource?: (go: (s: Screen) => void) => preact.ComponentChildren;
  fillMyList?: preact.ComponentChildren;
  onSkipWord?: (word: WordRecord) => void;
  notice?: string | null;
  onNoticeShown?: () => void;
}

export function App({ boot, content, dataSource, fillMyList, onSkipWord, notice, onNoticeShown }: AppProps) {
  const { store } = boot;
  const voice = useVoice();
  const canListen = voice === 'ready';
  const [prefs, setPrefs] = useState<Prefs>(boot.settings);
  const [screen, go] = useScreen();
  const practice = useMemo(() => new Practice(content.words, boot.events, DEFAULT_CONFIG), []);
  const [pick, setPick] = useState<Pick | null>(() => practice.next(Date.now(), canListen));
  const [cardKey, setCardKey] = useState(0);
  const [toast, setToast] = useState<{ text: string; action?: { label: string; run: () => void } } | null>(null);
  const visit = useRef({ cards: 0, answered: 0, askedPersist: false });
  const firstCardOfVisit = visit.current.cards === 0;

  // New content (a sync brought rows, a word was skipped): rebuild the engine's view, keep the card.
  useEffect(() => {
    practice.setWords(content.words);
    if (!pick || !practice.word(pick.word.id)) setPick(practice.next(Date.now(), canListen));
  }, [content.words]);

  useEffect(() => {
    if (notice) {
      setToast({ text: notice });
      onNoticeShown?.();
    }
  }, [notice]);
  useEffect(() => {
    if (!toast || toast.action) return;
    const id = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(id);
  }, [toast]);

  const updatePrefs = (p: Prefs) => {
    setPrefs(p);
    applySettings(p);
    store.set('settings', p);
  };

  /** A run is one visit with at least one answer, ended by Done or by leaving the app. */
  const completeRun = async () => {
    if (visit.current.answered === 0) return;
    visit.current.answered = 0;
    const runs = { completed: 0, sinceBackup: 0, ...((await store.get<RunsMeta>('runs')) ?? {}) };
    const next = { completed: runs.completed + 1, sinceBackup: runs.sinceBackup + 1 };
    await store.set('runs', next);
    const state = await persistState();
    if (shouldAskPersist(next.completed, state, visit.current.askedPersist)) {
      visit.current.askedPersist = true;
      const result = await requestPersist();
      await store.set('persist', { at: Date.now(), result });
    }
    const meta: BackupMeta = { lastAt: null, hintShown: false, ...((await store.get<BackupMeta>('backup')) ?? {}) };
    if (shouldShowBackupHint(next, meta, practice.eventCount())) {
      await store.set('backup', { ...meta, hintShown: true });
      setToast({
        text: t('hint.backup'),
        action: { label: t('backup.now'), run: () => { setToast(null); go('settings'); } },
      });
    }
  };

  // Leaving the app ends the run; coming back starts a new visit.
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'hidden') {
        speech.stop();
        completeRun();
      } else {
        visit.current.cards = 0;
        practice.session = newSession();
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  const onAnswer = (a: Answer) => {
    if (!pick) return;
    const e = practice.answer(pick, a, Date.now());
    visit.current.answered++;
    store.appendEvents([e]).catch(() => setToast({ text: t('notice.saveFailed') }));
  };
  const onNext = () => {
    speech.stop();
    visit.current.cards++;
    setPick(practice.next(Date.now(), canListen));
    setCardKey((k) => k + 1);
  };
  const onDone = async () => {
    speech.stop();
    await completeRun();
    go('done');
  };

  const sourceLine = content.kind === 'demo' ? (
    <>
      <span class="label">{t('source.demo')}</span>
      <button type="button" class="link" onClick={() => go('settings')}>{t('source.connect')}</button>
    </>
  ) : (
    <span class="label">{content.summary()}</span>
  );

  if (screen === 'settings') {
    return (
      <Settings
        store={store}
        prefs={prefs}
        voice={voice}
        quarantined={boot.quarantined}
        dataSource={dataSource?.(go)}
        fillMyList={fillMyList}
        onPrefs={updatePrefs}
        onRestored={() => location.reload()}
        onClose={() => go('practice')}
      />
    );
  }

  if (screen === 'done') {
    return (
      <main class="screen done">
        <p class="done-line">{t('done.title')}</p>
        <button type="button" class="secondary" onClick={() => { visit.current.cards = 0; practice.session = newSession(); onNext(); go('practice'); }}>
          {t('done.again')}
        </button>
      </main>
    );
  }

  const st = pick ? practice.states.get(pick.word.id) : undefined;
  return (
    <div class="app">
      <nav class="top">
        <button type="button" class="icon-btn" aria-label={t('settings.title')} onClick={() => go('settings')}>
          <SettingsIcon />
        </button>
      </nav>
      {pick ? (
        <Card
          key={cardKey}
          word={pick.word}
          exercise={pick.exercise}
          stage={st?.stage ?? 0}
          canListen={canListen}
          haptics={prefs.haptics}
          tags={content.tagsFor(pick.word)}
          sourceLine={firstCardOfVisit ? sourceLine : undefined}
          inviteAloud={visit.current.cards >= 1 && visit.current.cards % 7 === 3}
          onAnswer={onAnswer}
          onNext={onNext}
          onDone={onDone}
          onSkipWord={onSkipWord && content.canSkip(pick.word) ? () => onSkipWord(pick.word) : undefined}
        />
      ) : (
        <main class="screen empty">
          <div class="source-line">{sourceLine}</div>
          <p>{t('practice.empty')}</p>
        </main>
      )}
      {toast && (
        <div class="toast" role="status">
          <p>{toast.text}</p>
          {toast.action && (
            <div class="row">
              <button type="button" class="quiet" onClick={() => setToast(null)}>{t('common.notNow')}</button>
              <button type="button" class="secondary" onClick={toast.action.run}>{toast.action.label}</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
