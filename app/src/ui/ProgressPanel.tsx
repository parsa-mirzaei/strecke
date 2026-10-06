import { useState } from 'preact/hooks';
import { speech, type VoiceStatus } from '../audio/tts';
import { DOMAIN_LABEL, type UsageEntry } from '../data/types';
import { progressByDomain } from '../engine/progress';
import type { Feed } from '../state/useFeed';
import { BackIcon } from './icons';
import { getTheme, setTheme, type Theme } from './theme';

interface Props {
  feed: Feed;
  voice: VoiceStatus;
  usage: UsageEntry[];
  leaving: boolean;
  onClose: () => void;
  onReset: () => void;
}

const THEMES: { value: Theme; label: string }[] = [
  { value: 'dark', label: 'Dunkel' },
  { value: 'light', label: 'Hell' },
  { value: 'system', label: 'Wie das Gerät' },
];

/** "Was du schon sagen kannst": per situation, the real sentences you can now say. No scores. */
export function ProgressPanel({ feed, voice, usage, leaving, onClose, onReset }: Props) {
  const [open, setOpen] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [theme, setThemeState] = useState<Theme>(getTheme());
  const groups = progressByDomain(feed.items, feed.states);
  const total = groups.reduce((n, g) => n + g.sayable.length, 0);

  const copyUsage = async () => {
    const lines = usage.map((u) => `${new Date(u.open).toISOString()}\t${Math.round((u.close - u.open) / 1000)}s\t${u.cards}`);
    const text = ['Strecke: Nutzungsprotokoll', 'Start\tDauer\tEinträge', ...lines].join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      window.prompt('Kopieren:', text);
    }
  };

  return (
    <section class={leaving ? 'panel is-leaving' : 'panel'} aria-label="Was du schon sagen kannst">
      <div class="panel-top">
        <button type="button" class="icon-btn" onClick={onClose} aria-label="Zurück">
          <BackIcon />
        </button>
      </div>
      <h1>Was du schon sagen kannst</h1>
      <p class="panel-lede">
        {total === 0
          ? 'Noch nichts ganz sicher. Was du ohne Hilfe abrufen kannst, sammelt sich hier.'
          : 'Sätze, die du ohne Hilfe abrufen kannst. Tippen zum Anhören.'}
      </p>

      {groups.map((g) => {
        const expanded = open === g.domain;
        const shown = expanded ? g.sayable : g.sayable.slice(0, 4);
        return (
          <section class="said" key={g.domain}>
            <h2>{DOMAIN_LABEL[g.domain]}</h2>
            {shown.length === 0 ? (
              <p class="said-empty">{g.underway > 0 ? 'Kommt gerade.' : 'Noch nicht dran.'}</p>
            ) : (
              <ul>
                {shown.map((i) => (
                  <li key={i.id}>
                    <button type="button" lang="de" onClick={() => speech.speak(i.tier === 'chunk' ? i.de : i.sentence)}>
                      {i.tier === 'chunk' ? i.de : i.sentence}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {g.sayable.length > 4 && (
              <button type="button" class="quiet" onClick={() => setOpen(expanded ? null : g.domain)}>
                {expanded ? 'Weniger' : 'Alle zeigen'}
              </button>
            )}
          </section>
        );
      })}

      <section class="said">
        <h2>Festgehalten</h2>
        {feed.captures.length === 0 ? (
          <p class="said-empty">Hörst du ein Wort, das du behalten willst? Tippe auf +.</p>
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
      </section>

      <section class="about">
        <h2>Darstellung</h2>
        <div class="seg" role="radiogroup" aria-label="Darstellung">
          {THEMES.map((t) => (
            <button
              type="button"
              key={t.value}
              role="radio"
              aria-checked={theme === t.value}
              onClick={() => {
                setTheme(t.value);
                setThemeState(t.value);
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
        <h2>Diese Version</h2>
        <p>Beispieldaten, nur auf diesem Gerät gespeichert. Funktioniert auch offline.</p>
        {voice === 'none' && <p>Keine deutsche Stimme gefunden. Android: Einstellungen › Sprachausgabe › Sprachdaten installieren › Deutsch. Bis dahin bleibt alles stumm.</p>}
        {voice === 'unsupported' && <p>Dieser Browser kann nicht vorlesen. Bis dahin bleibt alles stumm.</p>}
        {voice === 'ready' && speech.voice && <p>Stimme: {speech.voice.name}</p>}
        <button type="button" class="quiet" onClick={copyUsage}>{copied ? 'Kopiert' : `Nutzungsprotokoll kopieren (${usage.length})`}</button>
        <button
          type="button"
          class="quiet"
          onClick={() => {
            if (window.confirm('Beispieldaten und Fortschritt auf diesem Gerät zurücksetzen?')) onReset();
          }}
        >
          Beispieldaten zurücksetzen
        </button>
      </section>
    </section>
  );
}
