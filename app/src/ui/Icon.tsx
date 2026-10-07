import { h } from 'preact';
import { ICONS } from './icons';

/** A bundled Lucide icon, drawn as elements (never as an HTML string). Decorative unless labelled. */
export function Icon({ name, size = 24, label }: { name: string; size?: number; label?: string }) {
  const nodes = ICONS[name];
  if (!nodes) return null;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width={2}
      stroke-linecap="round"
      stroke-linejoin="round"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      {nodes.map(([tag, attrs], i) => h(tag, { ...attrs, key: i }))}
    </svg>
  );
}
