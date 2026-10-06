import { useEffect, useRef, useState } from 'preact/hooks';
import { speech, type VoiceStatus } from './audio/tts';
import type { DataAdapter, Snapshot } from './data/adapter';
import type { UsageEntry } from './data/types';
import { useFeed } from './state/useFeed';
import { CaptureSheet } from './ui/CaptureSheet';
import { FeedView } from './ui/FeedView';
import { ProgressPanel } from './ui/ProgressPanel';

type Overlay = 'progress' | 'capture' | null;

/** Overlays sit on top of the feed; the Android back button closes them. */
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

function useOnline(): boolean {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

/** Usage log for the real-life test: opens, seconds and cards per open. Local only. */
function useUsageLog(adapter: DataAdapter, initial: UsageEntry[], cards: () => number) {
  const [usage, setUsage] = useState(initial);
  const log = useRef(initial);
  const openAt = useRef(Date.now());
  const cardsAtOpen = useRef(0);

  useEffect(() => {
    const close = () => {
      const entry = { open: openAt.current, close: Date.now(), cards: cards() - cardsAtOpen.current };
      log.current = [...log.current, entry];
      adapter.saveUsage(log.current);
      setUsage(log.current);
    };
    const onVis = () => {
      if (document.visibilityState === 'hidden') {
        close();
        speech.stop();
      } else {
        openAt.current = Date.now();
        cardsAtOpen.current = cards();
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
  const online = useOnline();
  const usage = useUsageLog(adapter, snapshot.usage, feed.cardsThisVisit);
  const { overlay, leaving, open, close } = useOverlay();

  return (
    <div class="app">
      <FeedView
        feed={feed}
        canListen={voice === 'ready'}
        onOpenProgress={() => open('progress')}
        onOpenCapture={() => open('capture')}
      />
      {overlay === 'progress' && (
        <ProgressPanel
          feed={feed}
          voice={voice}
          online={online}
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
