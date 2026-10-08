/**
 * Design-review screenshots of the running dev server (DECISIONS D50). Drives a local headless Chrome
 * over the DevTools protocol with Node's built-in WebSocket: no dependency. Each shot gets a fresh
 * profile, so the local adapter imports the seed anew.
 *
 *   node tools/app/shots.mjs <out-dir> [styles=1,2,3] [shots=all]
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = 'http://localhost:5173/';
const SIZES = { 390: [390, 844], 320: [320, 600] };
const THEMES = ['light', 'dark'];
const SHOTS = {
  cover: ['Anmeldung', 'cover'],
  revealed: ['Anmeldung', 'revealed'],
  next: ['Anmeldung', 'next'],
  long: ['Krankenkasse', 'revealed'],
  phrase: ['Können Sie bitte langsamer sprechen?', 'revealed'],
  thin: ['Schrank', 'revealed'],
  picto: ['Formular', 'cover'],
};

const out = process.argv[2];
const styles = (process.argv[3] ?? '2').split(',');
const names = process.argv[4] ? process.argv[4].split(',') : Object.keys(SHOTS);
mkdirSync(out, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function withChrome(fn) {
  const profile = mkdtempSync(join(tmpdir(), 'strecke-shot-'));
  const port = 9300 + Math.floor(Math.random() * 500);
  const proc = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
    `--user-data-dir=${profile}`, `--remote-debugging-port=${port}`, 'about:blank'], { stdio: 'ignore' });
  try {
    let target;
    for (let i = 0; i < 50 && !target; i++) {
      await sleep(100);
      try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page'); } catch { /* not up yet */ }
    }
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((r) => ws.addEventListener('open', r, { once: true }));
    let id = 0;
    const pending = new Map();
    ws.addEventListener('message', (m) => {
      const msg = JSON.parse(m.data);
      if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
    });
    const send = (method, params = {}) => new Promise((r) => { const n = ++id; pending.set(n, r); ws.send(JSON.stringify({ id: n, method, params })); });
    const result = await fn(send);
    ws.close();
    return result;
  } finally {
    proc.kill();
    await sleep(300);
    try { rmSync(profile, { recursive: true, force: true }); } catch { /* chrome may hold a lock briefly */ }
  }
}

async function shot(style, name, size, theme) {
  const [word, state] = SHOTS[name];
  const [w, h] = SIZES[size];
  const q = new URLSearchParams({ style, theme, word, state });
  return withChrome(async (send) => {
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 2, mobile: true });
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: theme }] });
    await send('Page.enable');
    await send('Page.navigate', { url: BASE + '?' + q });
    // Wait until the card exists and its scripted state has been applied (cover: 0.4 s; others: ~1.4 s).
    for (let i = 0; i < 80; i++) {
      await sleep(100);
      const r = await send('Runtime.evaluate', { expression: '!!document.querySelector(".card")', returnByValue: true });
      if (r.result?.result?.value) break;
    }
    await sleep(state === 'cover' ? 700 : 1900);
    const shotRes = await send('Page.captureScreenshot', { format: 'png' });
    const file = join(out, `s${style}-${name}-${size}-${theme}.png`);
    writeFileSync(file, Buffer.from(shotRes.result.data, 'base64'));
    return file;
  });
}

for (const style of styles) for (const name of names) for (const size of Object.keys(SIZES)) for (const theme of THEMES) {
  console.log(await shot(style, name, size, theme));
}
