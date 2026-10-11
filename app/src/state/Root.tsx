/**
 * Owns the content source: demo deck or the learner's sheet (D49, D56). Connect, background sync when
 * the learner comes back to the app (debounced, offline-safe, never blocking a card), local skips.
 */
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { parseSheetReference } from '../../../core/src/sheet/link.ts';
import { App } from '../App';
import { getLocale, t } from '../i18n';
import { browserEnv, connect, connectFile, shouldAutoSync, syncSheet, type ConnectOutcome, type SheetCache, type SheetConnection, type SyncResult } from '../sheet/sync';
import { DataSource } from '../ui/settings/DataSource';
import type { Boot } from './boot';
import { demoContent, sheetContent } from './content';

export const KEYS = { conn: 'sheet.connection', cache: 'sheet.cache', skips: 'sheet.skips', ref: 'sheet.ref' } as const;

export interface RootProps {
  boot: Boot;
  initial: { conn: SheetConnection | null; cache: SheetCache | null; skips: string[] };
  /** Rendered in Settings › Fill my list (slice 4). */
  fillMyList?: (ctx: { conn: SheetConnection | null; cache: SheetCache | null; content: ReturnType<typeof sheetContent> | null }) => preact.ComponentChildren;
}

export async function loadSheetState(boot: Boot): Promise<RootProps['initial']> {
  const [conn, cache, skips] = await Promise.all([
    boot.store.get<SheetConnection>(KEYS.conn),
    boot.store.get<SheetCache>(KEYS.cache),
    boot.store.get<string[]>(KEYS.skips),
  ]);
  return { conn: conn ?? null, cache: cache ?? null, skips: Array.isArray(skips) ? skips : [] };
}

export function Root({ boot, initial, fillMyList }: RootProps) {
  const { store } = boot;
  const [conn, setConn] = useState(initial.conn);
  const [cache, setCache] = useState(initial.cache);
  const [skips, setSkips] = useState<string[]>(initial.skips);
  const [notice, setNotice] = useState<string | null>(null);
  const syncing = useRef(false);
  const state = useRef({ conn, cache });
  state.current = { conn, cache };

  const skipSet = useMemo(() => new Set(skips), [skips]);
  const locale = getLocale();
  const sheet = useMemo(() => (conn && cache ? sheetContent(cache, skipSet) : null), [conn, cache, skipSet, locale]);
  const content = useMemo(() => sheet ?? demoContent(), [sheet, locale]);

  const announce = (r: SyncResult) => {
    const n = r.diff?.added.length ?? 0;
    if (n > 0) setNotice(n === 1 ? t('notice.newWord') : t('notice.newWords', { n }));
  };

  const runSync = async (): Promise<SyncResult | null> => {
    const { conn: c, cache: prev } = state.current;
    if (!c || c.kind !== 'link' || syncing.current) return null;
    syncing.current = true;
    try {
      const r = await syncSheet(c, prev, browserEnv());
      await store.set(KEYS.cache, r.cache);
      setCache(r.cache);
      announce(r);
      return r;
    } finally {
      syncing.current = false;
    }
  };

  // Re-sync when the learner returns (visibility, focus, back online). Never awaited by practice.
  useEffect(() => {
    const maybe = () => {
      const { conn: c, cache: k } = state.current;
      if (document.visibilityState === 'visible' && shouldAutoSync(c, k, Date.now(), navigator.onLine !== false)) runSync();
    };
    maybe();
    document.addEventListener('visibilitychange', maybe);
    window.addEventListener('focus', maybe);
    window.addEventListener('online', maybe);
    return () => {
      document.removeEventListener('visibilitychange', maybe);
      window.removeEventListener('focus', maybe);
      window.removeEventListener('online', maybe);
    };
  }, []);

  const adopt = async (r: ConnectOutcome) => {
    if (!r.ok) {
      if (r.problem === 'edit_link' && r.sheetId) {
        const ref = parseSheetReference(`https://docs.google.com/spreadsheets/d/${r.sheetId}/edit`);
        if (ref.ok) await store.set(KEYS.ref, ref);
      }
      return r;
    }
    await store.setMany({ [KEYS.conn]: r.connection, [KEYS.cache]: r.result.cache });
    setConn(r.connection);
    setCache(r.result.cache);
    return r;
  };

  const dataSource = () => (
    <DataSource
      connection={conn}
      cache={cache}
      wordCount={sheet?.words.length ?? 0}
      skipped={skips.length}
      onConnect={async (links) => adopt(await connect(links, browserEnv()))}
      onFile={async (text, name) => adopt(connectFile(text, name, state.current.cache, Date.now()))}
      onSync={runSync}
      onDisconnect={async () => {
        await store.setMany({ [KEYS.conn]: null, [KEYS.cache]: null });
        setConn(null);
        setCache(null);
      }}
      onUnskip={async () => {
        await store.set(KEYS.skips, []);
        setSkips([]);
      }}
    />
  );

  return (
    <App
      boot={boot}
      content={content}
      dataSource={dataSource}
      fillMyList={fillMyList?.({ conn, cache, content: sheet })}
      notice={notice}
      onNoticeShown={() => setNotice(null)}
      onSkipWord={async (w) => {
        const next = [...new Set([...skips, w.id])];
        await store.set(KEYS.skips, next);
        setSkips(next);
      }}
    />
  );
}
