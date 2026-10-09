import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import preact from '@preact/preset-vite';
import { defineConfig, type Plugin } from 'vite';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const pkg = JSON.parse(readFileSync(here('./package.json'), 'utf8')) as { version: string };

/**
 * Content-Security-Policy for the build (A9): scripts only from this origin, and the only hosts the app may
 * talk to are its own origin, the learner's Sheet web app (Google) and the audio provider the learner can
 * switch on. Not applied to the dev server, whose hot reload needs inline scripts and a websocket.
 */
function csp(): Plugin {
  const policy = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "media-src 'self' blob: data:",
    "font-src 'self'",
    "connect-src 'self' https://docs.google.com https://*.googleusercontent.com https://api.elevenlabs.io https://script.google.com",
    "worker-src 'self'",
    "manifest-src 'self'",
    "base-uri 'self'",
    "form-action 'none'",
  ].join('; ');
  return {
    name: 'strecke-csp',
    apply: 'build',
    transformIndexHtml: () => [{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: policy }, injectTo: 'head-prepend' }],
  };
}

/**
 * Development only: serves the gitignored starter seed (data/seed/seed-50.csv) at /__dev/seed.csv so the
 * `local` adapter can import it on a phone in the same Wi-Fi. Never part of a build; never deployed.
 */
function devSeed(): Plugin {
  return {
    name: 'strecke-dev-seed',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__dev/seed.csv', (_req, res) => {
        readFile(here('../data/seed/seed-50.csv'), 'utf8')
          .then((csv) => { res.setHeader('Content-Type', 'text/csv; charset=utf-8'); res.setHeader('Cache-Control', 'no-store'); res.end(csv); })
          .catch(() => { res.statusCode = 404; res.end(); });
      });
    },
  };
}

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
  plugins: [preact(), serviceWorker(), devSeed(), csp()],
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  resolve: { alias: { '@core': here('../core/src') } },
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
    sourcemap: false,
  },
  server: {
    host: true,
    port: 5173,
    // The dev server is reachable from the phone on the LAN: it may read the app and the shared core,
    // nothing else in the repository (no data/, no docs, no tools).
    fs: { strict: true, allow: [here('.'), here('../core/src')] },
  },
});
