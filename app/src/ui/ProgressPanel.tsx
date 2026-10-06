import { useState } from 'preact/hooks';
import { speech, type VoiceStatus } from '../audio/tts';
import { DOMAIN_LABEL, type UsageEntry } from '../data/types';
import { daysThisMonth, progressByDomain, todayStats } from '../engine/progress';
import type { Feed } from '../state/useFeed';
import { BackIcon } from './icons';

interface Props {
  feed: Feed;
  voice: VoiceStatus;
  online: boolean;
  usage: UsageEntry[];
  leaving: boolean;
  onClose: () => void;
  onReset: () => void;
}

const MONTH = new Intl.DateTimeFormat('de-DE', { month: 'long' });

/** "Was du schon sagen kannst": a route with five stops, each listing sentences you can now say. */
export function ProgressPanel({ feed, voice, online, usage, leaving, onClose, onReset }: Props) {
  const [open, setOpen] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const now = Date.now();
  const stops = progressByDomain(feed.items, feed.states);
  const total = stops.reduce((n, s) => n + s.sayable.length, 0);
  const today = todayStats(feed.events, now);
  const days = daysThisMonth(feed.events, now);

  const copyUsage = async () => {
    const lines = usage.map((u) => `${new Date(u.open).toISOString()}\t${Math.round((u.close - u.open) / 1000)}s\t${u.cards} Karten`);
    const text = ['Strecke Prototyp: Nutzungsprotokoll', 'Start\tDauer\tKarten', ...lines].join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      window.prompt('Kopieren:', text);
    }
  };

  return (
    <section class={leaving ? 'panel is-leaving' : 'panel'} aria-label="Strecke">
      <div class="panel-top">
        <button class="icon-btn" onClick={onClose} aria-label="Zurück zur Karte">
          <BackIcon />
        </button>
      </div>
      <h1>Was du schon sagen kannst</h1>
      <p class="panel-lede">
        {total === 0
          ? 'Noch nichts ganz sicher. Jede Karte bringt dich ein Stück weiter.'
          : `${total} Wörter und Sätze kannst du sicher selbst sagen.`}
      </p>

      <ol class="route">
        {stops.map((s) => {
          const expanded = open === s.domain;
          const shown = expanded ? s.sayable : s.sayable.slice(0, 3);
          return (
            <li class={s.sayable.length ? 'stop has-sayable' : 'stop'} key={s.domain}>
              <h2>{DOMAIN_LABEL[s.domain]}</h2>
              <p class="stop-count">
                {s.sayable.length} sagbar{s.underway ? `, ${s.underway} unterwegs` : ''}
              </p>
              {shown.length > 0 && (
                <ul>
                  {shown.map((i) => (
                    <li key={i.id}>
                      <button lang="de" onClick={() => speech.speak(i.tier === 'chunk' ? i.de : i.sentence)}>
                        {i.tier === 'chunk' ? i.de : i.sentence}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {s.sayable.length > 3 && (
                <button class="stop-more" onClick={() => setOpen(expanded ? null : s.domain)}>
                  {expanded ? 'Weniger zeigen' : `${s.sayable.length - 3} weitere`}
                </button>
              )}
            </li>
          );
        })}
      </ol>

      <div class="panel-section">
        <h2>Heute</h2>
        <p>
          {today.cards === 0
            ? 'Noch keine Karte heute.'
            : `${today.cards} Karten, davon ${today.said} ${today.said === 1 ? 'Satz' : 'Sätze'} selbst gesagt.`}
        </p>
        {days > 0 && <p>Im {MONTH.format(now)} an {days} {days === 1 ? 'Tag' : 'Tagen'} Deutsch geübt.</p>}
      </div>

      <div class="panel-section">
        <h2>Festgehalten</h2>
        {feed.captures.length === 0 ? (
          <p>Hörst du ein Wort, das du behalten willst? Tippe auf +.</p>
        ) : (
          <ul class="captured">
            {feed.captures.slice(0, 8).map((c) => (
              <li key={c.id}>
                <span lang="de">{c.text}</span>
                <small>wird ergänzt</small>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div class="panel-section">
        <h2>Prototyp</h2>
        <p>Beispieldaten, nur auf diesem Gerät gespeichert. {online ? '' : 'Gerade offline, alles funktioniert weiter.'}</p>
        {voice === 'none' && <p>Keine deutsche Stimme gefunden. Android: Einstellungen › Sprachausgabe › Sprachdaten installieren › Deutsch. Hörkarten sind solange ausgeblendet.</p>}
        {voice === 'unsupported' && <p>Dieser Browser kann nicht vorlesen. Hörkarten sind ausgeblendet.</p>}
        {voice === 'ready' && speech.voice && <p>Stimme: {speech.voice.name}</p>}
        <p>{usage.length} Mal geöffnet.</p>
        <button class="text-btn" onClick={copyUsage}>{copied ? 'Kopiert' : 'Nutzungsprotokoll kopieren'}</button>
        <br />
        <button
          class="text-btn"
          onClick={() => {
            if (window.confirm('Beispieldaten und Fortschritt auf diesem Gerät zurücksetzen?')) onReset();
          }}
        >
          Beispieldaten zurücksetzen
        </button>
      </div>
    </section>
  );
}
