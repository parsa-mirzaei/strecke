/** Four icons, drawn for this app. Stroke follows currentColor. */

const base = { fill: 'none', stroke: 'currentColor', 'stroke-width': 1.75, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' } as const;

/** Progress: a route with two stops. */
export const RouteIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...base}>
    <path d="M6 19c0-4 4-5 6-7s6-3 6-7" />
    <circle cx="6" cy="19" r="2" fill="currentColor" stroke="none" />
    <circle cx="18" cy="5" r="2" />
  </svg>
);

export const PlusIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...base}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const SpeakerIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...base}>
    <path d="M4 10v4h3l5 4V6L7 10H4z" />
    <path d="M16 9.5a3.5 3.5 0 0 1 0 5M18.5 7a7 7 0 0 1 0 10" />
  </svg>
);

export const PlayIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" fill="currentColor" />
  </svg>
);

export const BackIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...base}>
    <path d="M15 5l-7 7 7 7" />
  </svg>
);

export const CheckIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...base}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
);
