/**
 * Storage namespace. A preview build (`VITE_NS=preview`) runs on the same origin as the live app
 * (one GitHub Pages user site), where IndexedDB, localStorage and Cache Storage are shared; with its own
 * namespace it never reads, writes or deletes the live app's data.
 */
export const NS: string = import.meta.env.VITE_NS ? `strecke-${import.meta.env.VITE_NS}` : 'strecke';
/**
 * localStorage key. The Stable channel (default and `preview` builds) keeps its original `strecke.` /
 * `strecke-preview.` keys so an installed copy finds its data; every newer channel uses `<ns>:`.
 */
export const lsKey = (k: string) => (NS === 'strecke' || NS === 'strecke-preview' ? `${NS}.${k}` : `${NS}:${k}`);
/** Prefix shared by every localStorage key of this channel (for Reset). */
export const LS_PREFIX = NS === 'strecke' || NS === 'strecke-preview' ? `${NS}.` : `${NS}:`;

/** The channel this build belongs to: 'stable' for the default and the preview build, else the namespace name. */
export const CHANNEL: string = import.meta.env.VITE_NS && import.meta.env.VITE_NS !== 'preview' ? String(import.meta.env.VITE_NS) : 'stable';
