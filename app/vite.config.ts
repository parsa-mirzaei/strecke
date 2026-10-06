import { createHash } from 'node:crypto';
import preact from '@preact/preset-vite';
import { defineConfig, type Plugin } from 'vite';

/**
 * Writes sw.js after the build with the exact list of emitted files, so the app shell, fonts and
 * the synthetic deck are cached on first visit and the app opens offline. No PWA library needed.
 */
function serviceWorker(): Plugin {
  return {
    name: 'strecke-sw',
    apply: 'build',
    generateBundle(_opts, bundle) {
      // woff2 only: every browser that can install the PWA reads it; the .woff fallbacks are never fetched.
      const files = Object.keys(bundle).filter((f) => !f.endsWith('.map') && !f.endsWith('.woff'));
      const shell = ['./', 'index.html', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'icon-512-maskable.png'];
      const precache = [...new Set([...shell, ...files.map((f) => `./${f}`)])];
      const version = createHash('sha256').update(precache.join('|')).digest('hex').slice(0, 10);
      const source = `// Generated at build time. Precache the app shell; serve it cache-first; works offline.
const CACHE = 'strecke-${version}';
const PRECACHE = ${JSON.stringify(precache)};

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  // Removes older Strecke caches, including the Phase 0 spike's.
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
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

export default defineConfig({
  base: './',
  plugins: [preact(), serviceWorker()],
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
    sourcemap: false,
  },
  server: { host: true, port: 5173 },
});
