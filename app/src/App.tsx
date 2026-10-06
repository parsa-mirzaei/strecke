import { useEffect, useRef, useState } from 'preact/hooks';
import { speech, type VoiceStatus } from './audio/tts';
import type { DataAdapter, Snapshot } from './data/adapter';
import type { UsageEntry } from './data/types';
import { useFeed, type Feed } from './state/useFeed';
import { CaptureSheet } from './ui/CaptureSheet';
import { Heft } from './ui/Heft';
import { ProgressPanel } from './ui/ProgressPanel';

type Overlay = 'progress' | 'capture' | null;

/** Overlays sit on top of the Heft; the Android back button closes them. */
function useOverlay() {
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [leaving, setLeaving] = useState(false);
  const current = useRef<Overlay>(null);
  current.current = overlay;

  useEffect(() => {
    const onPop = () => {
      if (!current.current) return;
      setLeaving(true);
      window.setTimeout(() => {
        setOverlay(null);
        setLeaving(false);
      }, 220);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const open = (o: Exclude<Overlay, null>) => {
    if (current.current) return;
    history.pushState({ overlay: o }, '');
    setOverlay(o);
  };
  const close = () => {
    if (current.current) history.back();
  };
  return { overlay, leaving, open, close };
}

function useVoice(): VoiceStatus {
  const [status, setStatus] = useState<VoiceStatus>(speech.status);
  useEffect(() => speech.subscribe(setStatus), []);
  return status;
}

/**
 * Usage log for the real-life test: opens, seconds and items per open. Local only.
 * Leaving the app also settles the encounter in front, so a pending answer is never lost.
 */
function useVisits(adapter: DataAdapter, initial: UsageEntry[], feed: Feed) {
  const [usage, setUsage] = useState(initial);
  const log = useRef(initial);
  const openAt = useRef(Date.now());
  const atOpen = useRef(0);
  const feedRef = useRef(feed);
  feedRef.current = feed;

  useEffect(() => {
    const onVis = () => {
      const f = feedRef.current;
      if (document.visibilityState === 'hidden') {
        speech.stop();
        f.settleActive();
        const entry = { open: openAt.current, close: Date.now(), cards: f.cardsThisVisit() - atOpen.current };
        log.current = [...log.current, entry];
        adapter.saveUsage(log.current);
        setUsage(log.current);
      } else {
        openAt.current = Date.now();
        atOpen.current = f.cardsThisVisit();
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);
  return usage;
}

export function App({ adapter, snapshot }: { adapter: DataAdapter; snapshot: Snapshot }) {
  const voice = useVoice();
  const canListen = voice === 'ready' || voice === 'loading';
  const feed = useFeed(adapter, snapshot, canListen);
  const usage = useVisits(adapter, snapshot.usage, feed);
  const { overlay, leaving, open, close } = useOverlay();

  return (
    <div class="app">
      <Heft
        feed={feed}
        canListen={voice === 'ready'}
        demo={adapter.kind === 'mock'}
        onOpenProgress={() => open('progress')}
        onOpenCapture={() => open('capture')}
      />
      {overlay === 'progress' && (
        <ProgressPanel
          feed={feed}
          voice={voice}
          usage={usage}
          leaving={leaving}
          onClose={close}
          onReset={() => {
            adapter.reset();
            location.reload();
          }}
        />
      )}
      {overlay === 'capture' && (
        <CaptureSheet
          leaving={leaving}
          onClose={close}
          onSave={(text, domain) => {
            feed.addCapture(text, domain);
            close();
          }}
        />
      )}
    </div>
  );
}
