import type { DataAdapter } from '@core/data/adapter.ts';
import { DemoAdapter } from '@core/data/demo.ts';
import { LocalAdapter } from '@core/data/local.ts';
import { clearStore, openStore } from './idb';

export const randomBytes = (n: number) => crypto.getRandomValues(new Uint8Array(n));

/**
 * Which data the app runs on (DECISIONS D46). The UI never asks which one it got.
 *  - Development, with the gitignored seed served by the dev server: `local`, seeded once.
 *  - Everything else (the public build, or no seed file): `demo`, the bundled synthetic deck.
 * The `sheet` adapter joins in Phase E.
 */
export async function openSource(): Promise<DataAdapter> {
  if (import.meta.env.DEV && new URLSearchParams(location.search).has('reset')) {
    await clearStore();
    history.replaceState(null, '', location.pathname);
  }
  const store = await openStore();
  if (import.meta.env.DEV) {
    const local = new LocalAdapter({ store, now: Date.now, randomBytes, device: 'dev' });
    if ((await local.core()).words.length > 0) return local;
    try {
      const res = await fetch('/__dev/seed.csv', { cache: 'no-store' });
      if (res.ok) {
        await local.importCsv(await res.text());
        return local;
      }
    } catch { /* no seed: fall through to the demo deck */ }
  }
  return new DemoAdapter(store);
}
