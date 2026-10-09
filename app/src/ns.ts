/**
 * Storage namespace. A preview build (`VITE_NS=preview`) runs on the same origin as the live app
 * (one GitHub Pages user site), where IndexedDB, localStorage and Cache Storage are shared; with its own
 * namespace it never reads, writes or deletes the live app's data.
 */
export const NS: string = import.meta.env.VITE_NS ? `strecke-${import.meta.env.VITE_NS}` : 'strecke';
export const lsKey = (k: string) => `${NS}.${k}`;
