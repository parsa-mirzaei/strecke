/**
 * Optional visual mnemonics. Placeholder line drawings for the prototype; real images would be
 * optional URLs per item. Most items have none, and cards are designed to work without them.
 */

const s = { fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' } as const;
const accent = { ...s, stroke: 'var(--accent)' } as const;

const drawings: Record<string, { title: string; svg: preact.JSX.Element }> = {
  verspaetung: {
    title: 'Uhr zeigt zwanzig nach, der Zug ist noch weit weg',
    svg: (
      <svg viewBox="0 0 160 120">
        <circle cx="52" cy="54" r="30" {...s} />
        <path d="M52 54V34M52 54l14 8" {...s} />
        <path d="M52 24a30 30 0 0 1 26 15" {...accent} stroke-width="4" />
        <rect x="96" y="58" width="44" height="30" rx="8" {...s} />
        <path d="M104 70h28M108 88l-4 8M128 88l4 8" {...s} />
        <path d="M84 98h68" {...s} stroke-dasharray="4 6" />
      </svg>
    ),
  },
  haltestelle: {
    title: 'Haltestellenschild mit H an einem Mast',
    svg: (
      <svg viewBox="0 0 160 120">
        <path d="M60 46v62" {...s} />
        <circle cx="60" cy="30" r="18" {...accent} />
        <path d="M53 22v16M67 22v16M53 30h14" {...accent} />
        <path d="M84 84h52M90 84v14M130 84v14M84 72h52" {...s} />
        <path d="M20 108h124" {...s} />
      </svg>
    ),
  },
  anschluss: {
    title: 'Zwei Linien treffen sich an einem Punkt, der Anschluss',
    svg: (
      <svg viewBox="0 0 160 120">
        <path d="M14 86h56" {...s} />
        <path d="M70 86c22 0 26-46 76-46" {...accent} stroke-width="3" />
        <path d="M70 86h76" {...s} stroke-dasharray="4 7" />
        <circle cx="70" cy="86" r="7" {...s} fill="var(--bg)" />
        <circle cx="146" cy="40" r="5" fill="var(--accent)" />
      </svg>
    ),
  },
};

export function Mnemonic({ id }: { id: string }) {
  const d = drawings[id];
  if (!d) return null;
  return (
    <figure class="mnemonic" role="img" aria-label={d.title} style={{ margin: 0 }}>
      {d.svg}
    </figure>
  );
}
