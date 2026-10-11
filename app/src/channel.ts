/**
 * Build channel (DECISIONS D57). The live site and the preview build use different storage
 * namespaces, so trying a preview on the same phone never touches the live app's data:
 * IndexedDB database name, localStorage mirror keys and the service-worker cache all carry `NS`.
 */
export const CHANNEL: 'live' | 'preview' = import.meta.env.VITE_CHANNEL === 'preview' ? 'preview' : 'live';
export const NS: string = import.meta.env.VITE_NS || 'strecke';
