import type { DataAdapter } from '@core/data/adapter.ts';
import type { AppStore } from '../storage/store';
import { DemoAdapter } from '@core/data/demo.ts';
import { SheetAdapter, type OptionalTabs, type TableSource } from '@core/data/sheet.ts';
import { parseCsv } from '@core/csv.ts';
import type { Settings } from '@core/engine/settings.ts';

export const randomBytes = (n: number) => crypto.getRandomValues(new Uint8Array(n));

/** A Google Sheet published to the web as CSV (read-only). No credentials are sent. */
export function csvUrlSource(url: string): TableSource {
  return {
    label: 'Google Sheet (CSV)',
    async read() {
      const res = await fetch(url, { cache: 'no-store', credentials: 'omit', redirect: 'follow' });
      if (!res.ok) throw new Error(`http_${res.status}`);
      const text = await res.text();
      if (/^\s*<(!doctype|html)/i.test(text)) throw new Error('not_csv');
      return parseCsv(text, { keepEmpty: true }); // keeps the spreadsheet's own row numbers in notes
    },
  };
}

/** A CSV file the learner picks (a one-off import, also offline). */
export function csvTextSource(text: string, label = 'CSV file'): TableSource {
  return { label, read: async () => parseCsv(text, { keepEmpty: true }) };
}

export interface Opened {
  adapter: DataAdapter;
  /** Where a background sync reads from; null for demo and for a sheet read from a file. */
  source: TableSource | null;
  /** The optional Inbox and Meta tabs, read along with the words. */
  tabs?: OptionalTabs;
}

/**
 * Which data the app runs on (D46). The UI never asks which one it got.
 *  - A sheet link in the settings: `sheet`, from the last good copy on the device, refreshed in the background.
 *  - Development: `?sheet=stress|stress3|stress500` (committed synthetic fixtures), or the gitignored seed
 *    through the same ingestion as a real sheet; `?demo` forces the demo deck.
 *  - Otherwise: `demo`, the bundled synthetic deck.
 */
export async function openSource(app: AppStore, settings: Settings): Promise<Opened> {
  const q = new URLSearchParams(location.search);
  const store = app.kv, log = app.events;
  if (import.meta.env.DEV && q.has('sheet')) {
    const which = q.get('sheet')!;
    const { stressTable, tinyTable, bigTable } = await import('@core/data/stress-sheet.ts');
    const table = which === 'stress3' ? tinyTable() : which === 'stress500' ? bigTable(500) : stressTable();
    const adapter = new SheetAdapter(store, Date.now, `dev-${which}`, log);
    await adapter.sync({ label: which, read: async () => table });
    return { adapter, source: null };
  }
  const sh = settings.sheet;
  if (sh.csvUrl) {
    return {
      adapter: new SheetAdapter(store, Date.now, '', log),
      source: csvUrlSource(sh.csvUrl),
      tabs: { inbox: sh.inboxUrl ? csvUrlSource(sh.inboxUrl) : null, meta: sh.metaUrl ? csvUrlSource(sh.metaUrl) : null },
    };
  }
  // Words read from a CSV file: the same library, refreshed only when the learner picks a newer file.
  if (sh.fileName) return { adapter: new SheetAdapter(store, Date.now, '', log), source: null };
  if (import.meta.env.DEV && !q.has('demo')) {
    const res = await fetch('/__dev/seed.csv', { cache: 'no-store' }).catch(() => null);
    if (res?.ok) {
      const adapter = new SheetAdapter(store, Date.now, 'dev-seed', log);
      const text = await res.text();
      await adapter.sync(csvTextSource(text, 'seed'));
      return { adapter, source: null };
    }
  }
  const demo = new DemoAdapter(store, undefined, log);
  // Development: `?log=3d|30d|spiky` fills the demo deck with a simulated history (Verlauf checks).
  if (import.meta.env.DEV && q.has('log') && !(await demo.load()).events.length) {
    const { syntheticLog, shapeCards } = await import('@core/sim/log.ts');
    const words = (await demo.load()).words;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    await demo.appendEvents(syntheticLog(words, shapeCards(q.get('log') as 'empty' | '3d' | '30d' | 'spiky'), today.getTime()));
  }
  return { adapter: demo, source: null };
}
