import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { speech } from '../audio/tts';
import { DOMAIN_LABEL, type Item } from '../data/types';
import type { Card } from '../engine/scheduler';
import { todayStats } from '../engine/progress';
import type { Feed, FeedCard } from '../state/useFeed';
import { CheckIcon, PlayIcon, PlusIcon, RouteIcon, SpeakerIcon } from './icons';
import { HeadWord } from './HeadWord';
import { Mnemonic } from './Mnemonic';
import { splitWords, targetIndices, Words } from './Words';

interface Props {
  feed: Feed;
  canListen: boolean;
  onOpenProgress: () => void;
  onOpenCapture: () => void;
}

type Phase = 'ask' | 'revealed';

const reduceMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Fill a cloze with its answer. */
const filled = (text: string, answer: string) => text.replace('___', answer);

function shuffle<T>(xs: T[], seed: string): T[] {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) {
    h = (h * 1103515245 + 12345) >>> 0;
    const j = h % (i + 1);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

export function FeedView({ feed, canListen, onOpenProgress, onOpenCapture }: Props) {
  const { card, item, resting } = feed;
  const stageRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<Phase>('ask');
  const [picked, setPicked] = useState<string | null>(null);
  const [live, setLive] = useState(-1);
  const [speaking, setSpeaking] = useState(false);
  const seq = useRef(0);
  const audioFor = useRef<FeedCard | null>(null);

  // New card: reset per-card state. (Audio may already be running for it, started by the answering tap.)
  const cardKey = useMemo(() => ++seq.current, [card, resting]);
  useEffect(() => {
    setPhase('ask');
    setPicked(null);
    if (audioFor.current !== card) {
      setLive(-1);
      setSpeaking(false);
    }
  }, [cardKey]);

  // Notices fade on their own; undo stays a little longer.
  useEffect(() => {
    if (!feed.notice) return;
    const t = window.setTimeout(feed.clearNotice, feed.notice.undo ? 5000 : 2600);
    return () => window.clearTimeout(t);
  }, [feed.notice]);

  useEffect(() => () => speech.stop(), []);

  /** Speak for a given card; word callbacks only apply while that card is on screen. */
  const say = (text: string, forCard: FeedCard | null, rate = 1) => {
    if (!canListen) return;
    audioFor.current = forCard;
    setSpeaking(true);
    speech.speak(text, {
      rate,
      onWord: (i) => audioFor.current === forCard && setLive(i),
      onEnd: () => {
        if (audioFor.current !== forCard) return;
        setSpeaking(false);
        setLive(-1);
      },
    });
  };

  /** Copy the current card into a leaving layer so the next one can enter immediately. */
  const leave = () => {
    const el = stageRef.current?.querySelector<HTMLElement>('.card:not(.is-ghost)');
    if (!el || !stageRef.current) return;
    const ghost = el.cloneNode(true) as HTMLElement;
    ghost.classList.add('is-ghost');
    ghost.setAttribute('aria-hidden', 'true');
    ghost.inert = true;
    ghost.style.transition = 'none';
    ghost.scrollTop = el.scrollTop;
    stageRef.current.appendChild(ghost);
    const anim = ghost.animate(
      reduceMotion()
        ? [{ opacity: 1 }, { opacity: 0 }]
        : [{ opacity: 1, transform: 'translateY(0)' }, { opacity: 0, transform: 'translateY(-1.5rem)' }],
      { duration: 160, easing: 'cubic-bezier(0.23, 1, 0.32, 1)', fill: 'forwards' },
    );
    anim.onfinish = () => ghost.remove();
  };

  /** After any answer: animate out, and if the next card is Listen, start it inside this tap. */
  const goTo = (next: FeedCard | null) => {
    speech.stop();
    if (next && next.type === 'listen') {
      const nextItem = feed.items.find((i) => i.id === next.itemId);
      if (nextItem) say(nextItem.sentence, next);
    } else {
      audioFor.current = null;
    }
  };

  const grade = (g: 'new' | 'known' | 'good' | 'miss') => {
    leave();
    goTo(feed.answer(g));
  };

  // Swipe left anywhere on the stage opens Strecke.
  const swipe = useRef<{ x: number; y: number; t: number } | null>(null);
  const onPointerDown = (e: PointerEvent) => {
    if (e.pointerType === 'mouse') return;
    swipe.current = { x: e.clientX, y: e.clientY, t: e.timeStamp };
  };
  const onPointerUp = (e: PointerEvent) => {
    const s = swipe.current;
    swipe.current = null;
    if (!s) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    const v = Math.abs(dx) / Math.max(1, e.timeStamp - s.t);
    if (dx < -50 && Math.abs(dx) > Math.abs(dy) * 1.5 && (dx < -90 || v > 0.4)) onOpenProgress();
  };

  const stats = todayStats(feed.events, Date.now());
  const where = item ? DOMAIN_LABEL[item.domain] : resting ? 'Pause' : card?.type === 'checkpoint' ? 'Zwischenstand' : '';
  const isSuggestion = !!item && feed.states[item.id]?.status === 'pending';

  let body: preact.JSX.Element | null = null;
  let actions: preact.JSX.Element | null = null;

  if (resting) {
    body = (
      <div class="card-tap pause">
        <p class="pause-line">Bis gleich.</p>
        <p class="pause-sub">Beim nächsten Öffnen geht es genau hier weiter.</p>
      </div>
    );
    actions = (
      <div class="actions">
        <button class="act act-quiet" onClick={() => { leave(); goTo(feed.resume()); }}>Noch eine Karte</button>
      </div>
    );
  } else if (card?.type === 'checkpoint') {
    const line =
      stats.said > 0
        ? `Heute ${stats.cards} Karten, davon ${stats.said} ${stats.said === 1 ? 'Satz' : 'Sätze'} selbst gesagt.`
        : `Heute ${stats.cards} Karten.`;
    body = (
      <div class="card-tap pause">
        <p class="pause-line">{line}</p>
        <p class="pause-sub">Weiter, oder später wieder. Beides ist gut.</p>
      </div>
    );
    actions = (
      <div class="actions">
        <button class="act act-quiet" onClick={() => feed.leaveCheckpoint(true)}>Fertig</button>
        <button class="act act-primary" onClick={() => { leave(); goTo(feed.leaveCheckpoint(false)); }}>Weiter</button>
      </div>
    );
  } else if (card && item) {
    const r = renderItemCard({
      card, item, phase, picked, live, speaking, canListen, isSuggestion,
      reps: feed.states[item.id]?.reps ?? 0,
      say: (text, rate) => say(text, card, rate),
      reveal: () => {
        if (phase !== 'ask') return;
        setPhase('revealed');
        if (card.type === 'recall') {
          const cz = card.cloze === 2 && item.cloze2 ? item.cloze2 : item.cloze1;
          say(filled(cz.text, cz.answer), card);
        }
      },
      pick: (choice) => {
        if (picked) return;
        setPicked(choice);
        setPhase('revealed');
      },
      grade,
      dismiss: () => { leave(); goTo(feed.dismiss()); },
    });
    body = r.body;
    actions = r.actions;
  } else {
    body = (
      <div class="card-tap pause">
        <p class="pause-line">Noch keine Karten.</p>
        <p class="pause-sub">Füge mit + ein Wort hinzu, das du heute gehört hast.</p>
      </div>
    );
  }

  return (
    <>
      <header class="topbar">
        <div class="topbar-where">
          <span>{where}</span>
          {isSuggestion && <span class="suggest-tag">Vorschlag</span>}
        </div>
        <button class="icon-btn" onClick={onOpenProgress} aria-label="Strecke: was du schon sagen kannst">
          <RouteIcon />
        </button>
        <button class="icon-btn" onClick={onOpenCapture} aria-label="Wort festhalten">
          <PlusIcon />
        </button>
      </header>

      <main class="stage" ref={stageRef} onPointerDown={onPointerDown} onPointerUp={onPointerUp} style={{ touchAction: 'pan-y' }}>
        <div class="card" key={cardKey}>
          {body}
        </div>
        {feed.notice && (
          <div class="notice" role="status">
            {feed.notice.kind === 'sayable' && (<span>Jetzt sagbar: <b lang="de">{feed.notice.text}</b></span>)}
            {feed.notice.kind === 'saved' && (<span>Festgehalten: <b lang="de">{feed.notice.text}</b></span>)}
            {feed.notice.kind === 'dismissed' && <span>{feed.notice.text}</span>}
            {feed.notice.undo && <button onClick={feed.notice.undo}>Rückgängig</button>}
          </div>
        )}
      </main>

      {actions ?? <div class="actions" aria-hidden="true" />}
    </>
  );
}

interface CardArgs {
  card: Card;
  item: Item;
  phase: Phase;
  picked: string | null;
  live: number;
  speaking: boolean;
  canListen: boolean;
  isSuggestion: boolean;
  reps: number;
  say: (text: string, rate?: number) => void;
  reveal: () => void;
  pick: (choice: string) => void;
  grade: (g: 'new' | 'known' | 'good' | 'miss') => void;
  dismiss: () => void;
}

/** Long press on a speaker = slower replay. */
function SpeakButton({ text, say, speaking, label }: { text: string; say: (t: string, rate?: number) => void; speaking: boolean; label: string }) {
  const timer = useRef(0);
  const long = useRef(false);
  return (
    <button
      type="button"
      class={speaking ? 'speak-btn is-speaking' : 'speak-btn'}
      aria-label={`${label} anhören. Lange drücken für langsamer.`}
      onPointerDown={() => {
        long.current = false;
        timer.current = window.setTimeout(() => { long.current = true; say(text, 0.7); }, 450);
      }}
      onPointerUp={() => window.clearTimeout(timer.current)}
      onPointerLeave={() => window.clearTimeout(timer.current)}
      onContextMenu={(e) => e.preventDefault()}
      onClick={() => { if (!long.current) say(text); }}
    >
      <SpeakerIcon />
      <span>{speaking ? 'spricht…' : 'Anhören'}</span>
    </button>
  );
}

function renderItemCard(a: CardArgs): { body: preact.JSX.Element; actions: preact.JSX.Element } {
  const { card, item, phase } = a;
  
  if (card.type === 'meet') {
    return {
      body: (
        <div class="card-tap">
          {a.isSuggestion && (
            <p class="kicker">
              Neu vorgeschlagen.{' '}
              <button type="button" class="text-btn" style={{ minHeight: 'auto', fontWeight: 500 }} onClick={a.dismiss}>Nicht für mich</button>
            </p>
          )}
          <div>
            <HeadWord text={item.de} article={item.article} plural={item.plural} onSpeak={() => a.say(`${item.article ? item.article + ' ' : ''}${item.de}`)} />
            <p class="meaning">{item.en}</p>
          </div>
          <div>
            <Words text={item.sentence} revealed focus={item.de.split(' ').sort((x, y) => y.length - x.length)[0]} />
            <p class="sentence-en" style={{ marginTop: '0.375rem' }}>{item.sentenceEn}</p>
          </div>
          {a.canListen && <div class="speak-row"><SpeakButton text={item.sentence} say={a.say} speaking={a.speaking} label="Satz" /></div>}
          {item.note && <p class="note">{item.note}</p>}
          {item.mnemonic && <Mnemonic id={item.mnemonic} />}
        </div>
      ),
      actions: (
        <div class="actions">
          <button class="act act-quiet" onClick={() => a.grade('known')}>Kenne ich schon</button>
          <button class="act act-primary" onClick={() => a.grade('new')}>Neu für mich</button>
        </div>
      ),
    };
  }

  if (card.type === 'listen') {
    // Reshuffled on every repetition, so the position of the right answer can't be learned.
    const options = shuffle([item.en, ...item.wrong], `${item.id}:${a.reps}`);
    const target = targetIndices(item.sentence, item.de);
    const right = a.picked === item.en;
    return {
      body: (
        <div class="card-tap is-centred">
          <div class="listen-row">
            <button
              type="button"
              class={a.speaking ? 'listen-play is-speaking' : 'listen-play'}
              onClick={() => a.say(item.sentence, a.live >= 0 || phase === 'revealed' ? 0.8 : 1)}
              aria-label="Satz anhören"
            >
              <PlayIcon />
            </button>
            <p>{phase === 'ask' ? 'Hör zu. Was heißt das markierte Wort?' : right ? 'Richtig gehört.' : 'Fast. So war es:'}</p>
          </div>
          <Words
            text={item.sentence}
            hideAll
            revealed={phase === 'revealed'}
            live={a.live}
            target={target}
            hero
            label={`Gesprochener Satz mit ${splitWords(item.sentence).length} Wörtern, noch verborgen`}
          />
          {phase === 'revealed' && <p class="sentence-en">{item.sentenceEn}</p>}
          <div class="choices" role="group" aria-label="Bedeutung wählen">
            {options.map((o) => {
              const state = !a.picked ? '' : o === item.en ? 'is-right' : o === a.picked ? 'is-wrong' : '';
              return (
                <button type="button" class={`choice ${state}`} disabled={!!a.picked && !state} onClick={() => a.pick(o)} key={o}>
                  <span>{o}</span>
                  {state === 'is-right' && <CheckIcon />}
                </button>
              );
            })}
          </div>
        </div>
      ),
      actions: a.picked ? (
        <div class="actions">
          <button class="act act-primary" onClick={() => a.grade(right ? 'good' : 'miss')}>Weiter</button>
        </div>
      ) : (
        <div class="actions">
          <button class="act act-quiet" onClick={() => a.say(item.sentence, 0.8)}>Langsamer anhören</button>
        </div>
      ),
    };
  }

  // Recall
  const cz = card.cloze === 2 && item.cloze2 ? item.cloze2 : item.cloze1;
  return {
    body: (
      <div
        class="card-tap is-centred"
        onClick={phase === 'ask' ? a.reveal : undefined}
        role={phase === 'ask' ? 'button' : undefined}
        aria-label={phase === 'ask' ? 'Aufdecken' : undefined}
      >
        <p class="kicker" style={{ visibility: phase === 'ask' ? 'visible' : 'hidden' }}>Sag den Satz laut, dann aufdecken.</p>
        <Words text={cz.text} gap={cz.answer} revealed={phase === 'revealed'} hero />
        {card.hint && cz.hint && phase === 'ask' && <p class="hint">Hinweis: <b>{cz.hint}</b></p>}
        {phase === 'revealed' && (
          <div class="answer">
            <span class="answer-de" lang="de">
              {item.article && <span class={`art-${item.article}`}>{item.article} </span>}
              {item.de}
            </span>
            <span class="answer-en">{item.en}</span>
          </div>
        )}
        {phase === 'revealed' && a.canListen && (
          <div class="speak-row" onClick={(e) => e.stopPropagation()}>
            <SpeakButton text={filled(cz.text, cz.answer)} say={a.say} speaking={a.speaking} label="Satz" />
          </div>
        )}
        {phase === 'revealed' && item.note && <p class="note">{item.note}</p>}
        {phase === 'revealed' && item.mnemonic && <Mnemonic id={item.mnemonic} />}
      </div>
    ),
    actions:
      phase === 'ask' ? (
        <div class="actions">
          <button class="act act-primary" onClick={a.reveal}>Aufdecken</button>
        </div>
      ) : (
        <div class="actions">
          <button class="act act-quiet" onClick={() => a.grade('miss')}>Nicht ganz</button>
          <button class="act act-primary" onClick={() => a.grade('good')}>Hatte ich</button>
        </div>
      ),
  };
}
