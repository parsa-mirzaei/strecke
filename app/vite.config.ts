import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import preact from '@preact/preset-vite';
import { defineConfig, type Plugin } from 'vite';

/**
 * Writes sw.js after the build with the exact list of emitted files, so the app shell, fonts and
 * the synthetic deck are cached on first visit and the app opens offline. No PWA library needed.
 */
function serviceWorker(ns: string): Plugin {
  return {
    name: 'strecke-sw',
    apply: 'build',
    generateBundle(_opts, bundle) {
      // woff2 only: every browser that can install the PWA reads it; the .woff fallbacks are never fetched.
      const files = Object.keys(bundle).filter((f) => !f.endsWith('.map') && !f.endsWith('.woff'));
      const shell = ['./', 'index.html', manifestName(ns), 'icon-192.png', 'icon-512.png', 'icon-512-maskable.png'];
      const precache = [...new Set([...shell, ...files.map((f) => `./${f}`)])];
      const version = createHash('sha256').update(precache.join('|')).digest('hex').slice(0, 10);
      const source = `// Generated at build time. Precache the app shell; serve it cache-first; works offline.
const CACHE = '${ns}-${version}';
const PRECACHE = ${JSON.stringify(precache)};

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  // Removes this channel's older caches only: live and preview may share an origin.
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && ${ns === 'strecke' ? "k.startsWith('strecke-') && !k.startsWith('strecke-preview-')" : `k.startsWith('${ns}-')`}).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  if (req.mode === 'navigate') {
    e.respondWith(caches.match('index.html').then((hit) => hit || fetch(req)));
    return;
  }
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req)));
});
`;
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

const manifestName = (ns: string) => (ns === 'strecke' ? 'manifest.webmanifest' : `manifest-${ns}.webmanifest`);

/**
 * Channel wiring (DECISIONS D57): `vite build` is the live app; `vite build --mode preview` is the
 * preview, with its own storage namespace, service-worker cache prefix, manifest name and output folder.
 */
function channel(ns: string, preview: boolean): Plugin {
  return {
    name: 'strecke-channel',
    transformIndexHtml(html) {
      return html.replaceAll('__NS__', ns).replace('./manifest.webmanifest', `./${manifestName(ns)}`);
    },
    generateBundle() {
      if (!preview) return;
      const base = JSON.parse(readFileSync(new URL('./public/manifest.webmanifest', import.meta.url), 'utf8'));
      const manifest = { ...base, id: './?preview', name: 'Strecke Preview', short_name: 'Preview' };
      this.emitFile({ type: 'asset', fileName: manifestName(ns), source: JSON.stringify(manifest, null, 2) });
    },
  };
}

export default defineConfig(({ mode }) => {
  const preview = mode === 'preview';
  const ns = preview ? 'strecke-preview' : 'strecke';
  return {
    base: './',
    plugins: [preact(), channel(ns, preview), serviceWorker(ns)],
    define: {
      'import.meta.env.VITE_CHANNEL': JSON.stringify(preview ? 'preview' : 'live'),
      'import.meta.env.VITE_NS': JSON.stringify(ns),
    },
    build: {
      target: 'es2022',
      assetsInlineLimit: 0,
      sourcemap: false,
      outDir: preview ? 'dist-preview' : 'dist',
    },
    // The shared engine lives in ../core; let the dev server read it.
    server: { host: true, port: 5173, fs: { allow: ['..'] } },
  };
});
