import { useState } from 'preact/hooks';
import { speech } from '../audio/tts';
import { DOMAIN_LABEL, type Grade, type Item } from '../data/types';
import type { Entry } from '../state/useFeed';
import { HeadWord } from './HeadWord';
import { CheckIcon, PlayIcon, SpeakerIcon } from './icons';
import { Mnemonic } from './Mnemonic';
import { splitWords, targetIndices, Words } from './Words';

export type Role = 'past' | 'active' | 'peek';

interface Props {
  entry: Entry;
  role: Role;
  canListen: boolean;
  isSuggestion: boolean;
  reps: number;
  /** Show the one-line "tap to reveal" help (first gap of a visit). */
  showTapHelp: boolean;
  /** Occasionally invite saying the line aloud. Never required. */
  inviteAloud: boolean;
  onAnswer: (g: Grade) => void;
  onPending: (g: Grade) => void;
  onDismiss: () => void;
  onUndo: () => void;
  onPromote: () => void;
  elRef?: (el: HTMLElement | null) => void;
}

const filled = (text: string, answer: string) => text.replace('___', answer);
const withArticle = (item: Item) => `${item.article ? item.article + ' ' : ''}${item.de}`;

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

/** A quoted two-turn exchange („…“ – „…“) is shown as a tiny dialogue. */
function parseScene(text: string): [string, string] | null {
  const m = /^„([^“]+)“\s*–\s*„(.+)“$/.exec(text.trim());
  return m ? [m[1]!, m[2]!] : null;
}

function useSpeaker(enabled: boolean) {
  const [speaking, setSpeaking] = useState(false);
  const [live, setLive] = useState(-1);
  const say = (text: string, rate = 1) => {
    if (!enabled) return;
    setSpeaking(true);
    speech.speak(text, {
      rate,
      onWord: setLive,
      onEnd: () => {
        setSpeaking(false);
        setLive(-1);
      },
    });
  };
  return { speaking, live, say };
}

function Hear({ text, say, speaking, label = 'Anhören' }: { text: string; say: (t: string, rate?: number) => void; speaking: boolean; label?: string }) {
  return (
    <button type="button" class={speaking ? 'quiet hear is-speaking' : 'quiet hear'} onClick={() => say(text)} aria-label={`${label}: ${text}`}>
      <SpeakerIcon />
      <span>{label}</span>
    </button>
  );
}

function Options({ options, right, picked, onPick, lang }: {
  options: string[];
  right: string;
  picked: string | null;
  onPick: (o: string) => void;
  lang?: string;
}) {
  return (
    <div class={lang === 'de' ? 'options is-articles' : 'options'} role="group">
      {options.map((o) => {
        const state = !picked ? '' : o === right ? 'is-right' : o === picked ? 'is-wrong' : 'is-out';
        return (
          <button type="button" key={o} class={`opt ${state}`} lang={lang} disabled={!!picked} onClick={() => onPick(o)}>
            <span>{o}</span>
            {state === 'is-right' && <CheckIcon />}
          </button>
        );
      })}
    </div>
  );
}

export function Encounter(p: Props) {
  const { entry, role, canListen } = p;
  const { item, card } = entry;
  const voice = useSpeaker(canListen);
  const [revealed, setRevealed] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const [silent, setSilent] = useState(false);
  const active = role === 'active';

  const where = p.isSuggestion ? <span class="where-tag">Vorschlag</span> : DOMAIN_LABEL[item.domain];
  let body: preact.JSX.Element;

  if (entry.outcome === 'dismiss') {
    body = (
      <div class="gone">
        <p>Nicht für dich. Kommt nicht wieder.</p>
        {entry.undo && active && <button type="button" class="quiet" onClick={p.onUndo}>Rückgängig</button>}
      </div>
    );
  } else if (card.type === 'meet') {
    const known = entry.pending === 'known' || entry.outcome === 'known';
    body = (
      <>
        <HeadWord text={item.de} article={item.article} plural={item.plural} onSpeak={canListen ? () => voice.say(withArticle(item)) : undefined} />
        <p class="gloss">{item.en}</p>
        <Words text={item.sentence} revealed focus={item.de.split(' ').sort((x, y) => y.length - x.length)[0]} />
        <p class="line-en">{item.sentenceEn}</p>
        {item.note && <p class="note">{item.note}</p>}
        {item.mnemonic && <Mnemonic id={item.mnemonic} />}
        <div class="row">
          {canListen && <Hear text={item.sentence} say={voice.say} speaking={voice.speaking} />}
          {p.isSuggestion && <button type="button" class="quiet" onClick={p.onDismiss}>Nicht für mich</button>}
          <button type="button" class="quiet toggle" aria-pressed={known} onClick={() => p.onPending(known ? 'new' : 'known')}>
            {known && <CheckIcon />}
            <span>Kenne ich schon</span>
          </button>
        </div>
      </>
    );
  } else if (card.type === 'choice' && card.variant === 'article') {
    const pick = (o: string) => {
      setPicked(o);
      p.onAnswer(o === item.article ? 'good' : 'miss');
    };
    body = (
      <>
        <p class="ask">der, die oder das?</p>
        <HeadWord text={item.de} article={item.article} hideArticle={!picked} onSpeak={picked && canListen ? () => voice.say(withArticle(item)) : undefined} />
        <Options options={['der', 'die', 'das']} right={item.article} picked={picked} onPick={pick} lang="de" />
        {picked && <p class="gloss">{item.en}{item.plural && item.plural !== 'nur Plural' ? `, Plural ${item.plural}` : ''}</p>}
      </>
    );
  } else if (card.type === 'choice' || card.type === 'listen') {
    const listening = card.type === 'listen' && !silent;
    const options = shuffle([item.en, ...item.wrong], `${item.id}:${p.reps}`);
    const target = targetIndices(item.sentence, item.de);
    const pick = (o: string) => {
      setPicked(o);
      p.onAnswer(o === item.en ? 'good' : 'miss');
    };
    body = (
      <>
        {listening ? (
          <>
            <div class="listen">
              <button
                type="button"
                class={voice.speaking ? 'play is-speaking' : 'play'}
                onClick={() => voice.say(item.sentence, voice.speaking || picked ? 0.8 : 1)}
                aria-label="Satz anhören"
              >
                <PlayIcon />
              </button>
              <p class="ask">Hör zu. Was heißt das markierte Wort?</p>
            </div>
            <Words
              text={item.sentence}
              hideAll
              revealed={!!picked}
              live={voice.live}
              target={target}
              label={`Gesprochener Satz mit ${splitWords(item.sentence).length} Wörtern, noch verborgen`}
            />
          </>
        ) : (
          <>
            <p class="ask">Was heißt das?</p>
            {item.tier === 'chunk' ? (
              <HeadWord text={item.de} article="" />
            ) : (
              <Words text={item.sentence} revealed focus={item.de.split(' ').sort((x, y) => y.length - x.length)[0]} />
            )}
          </>
        )}
        <Options options={options} right={item.en} picked={picked} onPick={pick} />
        {picked && <p class="line-en">{item.sentenceEn}</p>}
        <div class="row">
          {listening && !picked && <button type="button" class="quiet" onClick={() => setSilent(true)}>Gerade kein Ton? Text zeigen</button>}
          {picked && canListen && <Hear text={item.sentence} say={voice.say} speaking={voice.speaking} />}
        </div>
      </>
    );
  } else {
    // Recall: think of the word, tap, it inks in.
    const cz = card.cloze === 2 && item.cloze2 ? item.cloze2 : item.cloze1;
    const scene = parseScene(cz.text);
    const reveal = () => {
      if (revealed || !active) return;
      setRevealed(true);
      p.onPending('good');
    };
    const again = entry.pending === 'miss' || entry.outcome === 'miss';
    const gapLine = (text: string) => <Words text={text} gap={cz.answer} revealed={revealed} />;
    body = (
      <>
        {p.inviteAloud && !revealed && <p class="ask">Wenn du magst: sag es laut.</p>}
        <div
          class={revealed ? 'gapped' : 'gapped is-closed'}
          onClick={reveal}
          role={revealed ? undefined : 'button'}
          tabIndex={revealed ? undefined : 0}
          aria-label={revealed ? undefined : 'Aufdecken'}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), reveal())}
        >
          {scene ? (
            <div class="scene">
              <p class="turn" lang="de">„{scene[0]}“</p>
              <div class="turn is-you">{gapLine(`„${scene[1]}“`)}</div>
            </div>
          ) : (
            gapLine(cz.text)
          )}
        </div>
        {!revealed && card.hint && cz.hint && <p class="gloss">{cz.hint}</p>}
        {!revealed && p.showTapHelp && <p class="help">Denk es dir, dann tippen.</p>}
        {revealed && (
          <>
            <p class="answer">
              <span lang="de" class="answer-de">
                {item.article && <span class={`art-${item.article}`}>{item.article} </span>}
                {item.de}
              </span>
              <span class="answer-en">{item.en}</span>
            </p>
            {item.note && <p class="note">{item.note}</p>}
            {item.mnemonic && <Mnemonic id={item.mnemonic} />}
            <div class="row">
              {canListen && <Hear text={filled(cz.text, cz.answer).replace(/[„“]/g, '')} say={voice.say} speaking={voice.speaking} />}
              <button type="button" class="quiet toggle" aria-pressed={again} disabled={!!entry.outcome} onClick={() => p.onPending(again ? 'good' : 'miss')}>
                {again && <CheckIcon />}
                <span>Nochmal üben</span>
              </button>
            </div>
          </>
        )}
      </>
    );
  }

  return (
    <article
      ref={p.elRef}
      class={`enc enc-${card.type}`}
      data-role={role}
      onClick={role === 'peek' ? p.onPromote : undefined}
      aria-hidden={role === 'peek' ? 'true' : undefined}
      inert={role === 'past' || undefined}
    >
      <p class="where">{where}</p>
      {body}
      {entry.sayable && <p class="sayable">Das kannst du jetzt sagen.</p>}
    </article>
  );
}
