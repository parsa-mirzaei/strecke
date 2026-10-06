import { useEffect, useRef } from 'preact/hooks';
import { speech } from '../audio/tts';
import type { Feed } from '../state/useFeed';
import { Encounter } from './Encounter';
import { PlusIcon } from './icons';

interface Props {
  feed: Feed;
  canListen: boolean;
  demo: boolean;
  onOpenProgress: () => void;
  onOpenCapture: () => void;
}

/** Every fifth gap invites saying it aloud; never required. */
const INVITE_EVERY = 5;

/**
 * The Heft: one vertical scroll. Above, what you already did; in front, one encounter; below, the
 * next one already peeking. Scrolling the peek up into view (or tapping it) moves on.
 */
export function Heft({ feed, canListen, demo, onOpenProgress, onOpenCapture }: Props) {
  const { entries, active, trail } = feed;
  const els = useRef(new Map<number, HTMLElement>());
  const advanceRef = useRef(feed.advance);
  advanceRef.current = feed.advance;

  // Moving on: the peek's top crosses into the upper 40% of the screen.
  const peek = entries[active + 1];
  useEffect(() => {
    const el = peek && els.current.get(peek.key);
    if (!el) return;
    const io = new IntersectionObserver(
      (records) => {
        if (records.some((r) => r.isIntersecting)) {
          io.disconnect();
          advanceRef.current();
        }
      },
      { rootMargin: '0px 0px -60% 0px', threshold: 0 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [peek?.key]);

  useEffect(() => {
    const t = feed.notice && window.setTimeout(feed.clearNotice, 2600);
    return () => t && window.clearTimeout(t);
  }, [feed.notice]);

  const promote = (key: number) => {
    speech.stop();
    feed.advance();
    // After the re-render, bring the new encounter to the top.
    requestAnimationFrame(() => els.current.get(key)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  let recallCount = 0;
  let firstGapSeen = false;

  return (
    <>
      <main class="heft">
        <header class="mast">
          <span class="brand">
            Strecke{demo && <span class="brand-note">Beispiel</span>}
          </span>
          <button type="button" class="mast-link" onClick={onOpenProgress}>
            Was du schon sagen kannst
          </button>
        </header>

        {trail.length > 0 && (
          <ol class="trail" aria-label="Zuletzt">
            {trail.map((i) => (
              <li key={i.id}>
                <span lang="de">{i.article ? `${i.article} ${i.de}` : i.de}</span>
                <span class="trail-en">{i.en}</span>
              </li>
            ))}
          </ol>
        )}

        {entries.map((entry, k) => {
          const role = k < active ? 'past' : k === active ? 'active' : 'peek';
          let invite = false;
          let help = false;
          if (entry.card.type === 'recall') {
            recallCount += 1;
            invite = recallCount % INVITE_EVERY === 2;
            help = !firstGapSeen;
            firstGapSeen = true;
          }
          return (
            <Encounter
              key={entry.key}
              entry={entry}
              role={role}
              canListen={canListen}
              isSuggestion={entry.item.origin === 'suggestion' && entry.card.type === 'meet'}
              reps={feed.states[entry.item.id]?.reps ?? 0}
              showTapHelp={help}
              inviteAloud={invite}
              onAnswer={(g) => feed.answer(entry.key, g)}
              onPending={(g) => feed.setPending(entry.key, g)}
              onDismiss={() => feed.dismiss(entry.key)}
              onUndo={() => feed.undoDismiss(entry.key)}
              onPromote={() => promote(entry.key)}
              elRef={(el) => (el ? els.current.set(entry.key, el) : els.current.delete(entry.key))}
            />
          );
        })}

        {entries.length === 0 && (
          <div class="empty">
            <p>Noch nichts zu üben.</p>
            <p class="line-en">Halte mit + ein Wort fest, das du heute gehört hast.</p>
          </div>
        )}
        <div class="runout" aria-hidden="true" />
      </main>

      {feed.notice && (
        <p class="notice" role="status">
          {feed.notice.text}
        </p>
      )}

      <button type="button" class="capture-btn" onClick={onOpenCapture} aria-label="Wort festhalten">
        <PlusIcon />
      </button>
    </>
  );
}
