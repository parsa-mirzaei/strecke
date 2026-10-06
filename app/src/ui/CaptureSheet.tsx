import { useEffect, useRef, useState } from 'preact/hooks';
import { DOMAIN_LABEL, DOMAIN_ORDER, type Domain } from '../data/types';

interface Props {
  leaving: boolean;
  onSave: (text: string, domain: Domain | '') => void;
  onClose: () => void;
}

/**
 * Capture: hear a word, keep it in seconds. One field, an optional situation, save.
 * Prototype: stored on the device only. Enrichment of captures is a separate, later stream.
 */
export function CaptureSheet({ leaving, onSave, onClose }: Props) {
  const [text, setText] = useState('');
  const [domain, setDomain] = useState<Domain | ''>('');
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Focus after the sheet has started moving, so the keyboard does not fight the animation.
    const t = window.setTimeout(() => input.current?.focus(), 60);
    return () => window.clearTimeout(t);
  }, []);

  const clean = text.trim().replace(/\s+/g, ' ');
  const save = (e?: Event) => {
    e?.preventDefault();
    if (!clean) return;
    onSave(clean.slice(0, 80), domain);
  };

  return (
    <>
      <div class={leaving ? 'scrim is-leaving' : 'scrim'} onClick={onClose} />
      <form class={leaving ? 'sheet is-leaving' : 'sheet'} onSubmit={save} role="dialog" aria-modal="true" aria-labelledby="cap-title">
        <div class="sheet-grip" aria-hidden="true" />
        <h2 id="cap-title">Wort festhalten</h2>
        <p>Gehört, gelesen, gebraucht? Schreib es auf, die Karte entsteht später.</p>
        <label class="sr-only" for="cap-input">Wort oder Ausdruck</label>
        <input
          id="cap-input"
          ref={input}
          value={text}
          onInput={(e) => setText((e.target as HTMLInputElement).value)}
          lang="de"
          autocomplete="off"
          autocapitalize="off"
          spellcheck={false}
          enterkeyhint="done"
          maxLength={80}
          placeholder="zum Beispiel: zuständig"
        />
        <div class="chips" role="group" aria-label="Situation, optional">
          {DOMAIN_ORDER.map((d) => (
            <button
              type="button"
              key={d}
              class="chip"
              aria-pressed={domain === d}
              onClick={() => setDomain(domain === d ? '' : d)}
            >
              {DOMAIN_LABEL[d]}
            </button>
          ))}
        </div>
        <button type="submit" class="save" disabled={!clean}>Festhalten</button>
      </form>
    </>
  );
}
