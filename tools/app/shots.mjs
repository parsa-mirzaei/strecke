/**
 * Design-review screenshots and a scripted play-through of the running dev server (round 2).
 * Drives a local headless Chrome over the DevTools protocol with Node's built-in WebSocket: no dependency.
 * Every shot uses a fresh profile and the synthetic demo deck (`?demo`), never the private seed.
 *
 *   node tools/app/shots.mjs <out-dir> [scenes=all] [sizes=390,320] [themes=light,dark] [base-url]
 *   node tools/app/shots.mjs --flow            play whole runs through the real UI and report (exit 1 on a problem)
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = process.env.CHROME ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const SIZES = { 390: [390, 844], 320: [320, 600] };
const FORCE = 'luecke,artikel,plural,bedeutung,hoeren,tippen,reihenfolge,kollokation,kontext2,praeposition';

/** In-page helpers: answer the current card through the real buttons. */
const PAGE = `
window.__sleep = (ms) => new Promise((r) => setTimeout(r, ms));
window.__q = (s) => document.querySelector(s);
window.__btn = (text) => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === text && !b.disabled);
window.__answer = async (wrong) => {
  const x = window.__card.exercise, sleep = window.__sleep;
  if (x.type === 'karte') {
    window.__q('.flap').click(); await sleep(750);
    [...document.querySelectorAll('.ch')][wrong ? 0 : 2].click(); await sleep(800); return x.type;
  }
  if (x.type === 'tippen') {
    const i = window.__q('input.slot'); i.value = wrong ? 'qqq' : x.answer; i.dispatchEvent(new Event('input', { bubbles: true }));
    await sleep(60); window.__btn('Prüfen').click();
  } else if (x.type === 'reihenfolge') {
    const want = (wrong ? x.answer.split(' ').reverse() : x.answer.split(' '));
    for (const t of want) {
      const c = [...document.querySelectorAll('.chips .chip')].find((b) => !b.classList.contains('used') && !b.disabled && b.textContent === t);
      if (c) { c.click(); await sleep(40); }
    }
    await sleep(60); window.__btn('Prüfen').click();
  } else {
    const tags = [...document.querySelectorAll('.tag')];
    const pick = wrong ? tags.find((t) => t.textContent.trim() !== x.answer) : tags.find((t) => t.textContent.trim() === x.answer);
    pick.click(); await sleep(1000);
  }
  await sleep(250); window.__btn('Weiter').click(); await sleep(500); return x.type;
};
window.__play = async (runs, wrongEvery) => {
  const seen = []; let n = 0;
  for (let r = 0; r < runs; r++) {
    for (let g = 0; g < 40 && window.__q('.route') && window.__q('.card'); g++) { seen.push(await window.__answer(wrongEvery && ++n % wrongEvery === 0)); await window.__sleep(120); }
    if (!window.__q('.sum')) break;
    if (r < runs - 1) { window.__btn('Noch eine Runde').click(); await window.__sleep(900); }
  }
  return seen;
};
`;

/** Scenes: url query, then steps run in the page. */
const SCENES = {
  'karte-cover': { q: 'force=karte' },
  'karte-revealed': { q: 'force=karte', run: `window.__q('.flap').click(); await window.__sleep(900);` },
  'karte-long': { q: 'force=karte&word=Krankenkassenbeitrag' },
  'luecke': { q: 'force=luecke' },
  'luecke-right': { q: 'force=luecke', run: `const x = window.__card.exercise; [...document.querySelectorAll('.tag')].find((t) => t.textContent.trim() === x.answer).click(); await window.__sleep(1100);` },
  'luecke-wrong': { q: 'force=luecke', run: `const x = window.__card.exercise; [...document.querySelectorAll('.tag')].find((t) => t.textContent.trim() !== x.answer).click(); await window.__sleep(1800);` },
  'artikel': { q: 'force=artikel' },
  'plural': { q: 'force=plural' },
  'bedeutung': { q: 'force=bedeutung' },
  'hoeren': { q: 'force=hoeren' },
  'tippen': { q: 'force=tippen' },
  'tippen-done': { q: 'force=tippen', run: `const i = window.__q('input.slot'); i.value = window.__card.exercise.answer; i.dispatchEvent(new Event('input', { bubbles: true })); await window.__sleep(80); window.__btn('Prüfen').click(); await window.__sleep(400);` },
  'reihenfolge': { q: 'force=reihenfolge' },
  'reihenfolge-half': { q: 'force=reihenfolge', run: `const w = window.__card.exercise.answer.split(' '); for (const t of w.slice(0, 3)) { [...document.querySelectorAll('.chips .chip')].find((b) => !b.classList.contains('used') && b.textContent === t).click(); await window.__sleep(60); }` },
  'kollokation': { q: 'force=kollokation' },
  'kontext2': { q: 'force=kontext2' },
  'praeposition': { q: 'force=praeposition' },
  'summary': { q: '', run: `await window.__play(1, 0); await window.__sleep(500);` },
  'end': { q: '', run: `await window.__play(1, 0); window.__btn('Fertig').click(); await window.__sleep(600);` },
  'verlauf-empty': { q: '', run: `window.__q('.quiet').click(); await window.__sleep(300); [...document.querySelectorAll('.quiet')].find((b) => b.textContent.includes('Verlauf'))?.click(); await window.__sleep(600);` },
  'verlauf': { q: '', run: `await window.__play(5, 3); await window.__sleep(400); window.__btn('Verlauf ansehen').click(); await window.__sleep(700);` },
  'settings': { q: '', run: `window.__btn('Fertig')?.click(); await window.__sleep(500); [...document.querySelectorAll('.quiet')].find((b) => b.textContent.includes('Einstellungen')).click(); await window.__sleep(600);` },
  'settings-uebungen': { q: '', run: `window.__btn('Fertig')?.click(); await window.__sleep(500); [...document.querySelectorAll('.quiet')].find((b) => b.textContent.includes('Einstellungen')).click(); await window.__sleep(500); [...document.querySelectorAll('.menu button')][0].click(); await window.__sleep(600);` },
  'settings-audio': { q: '', run: `window.__btn('Fertig')?.click(); await window.__sleep(500); [...document.querySelectorAll('.quiet')].find((b) => b.textContent.includes('Einstellungen')).click(); await window.__sleep(500); [...document.querySelectorAll('.menu button')][1].click(); await window.__sleep(600);` },
  'settings-daten': { q: '', run: `window.__btn('Fertig')?.click(); await window.__sleep(500); [...document.querySelectorAll('.quiet')].find((b) => b.textContent.includes('Einstellungen')).click(); await window.__sleep(500); [...document.querySelectorAll('.menu button')][2].click(); await window.__sleep(600);` },
  'settings-ueber': { q: '', run: `window.__btn('Fertig')?.click(); await window.__sleep(500); [...document.querySelectorAll('.quiet')].find((b) => b.textContent.includes('Einstellungen')).click(); await window.__sleep(500); [...document.querySelectorAll('.menu button')][5].click(); await window.__sleep(600);` },
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function withChrome(fn) {
  const profile = mkdtempSync(join(tmpdir(), 'strecke-shot-'));
  const port = 9300 + Math.floor(Math.random() * 500);
  const proc = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', `--user-data-dir=${profile}`, `--remote-debugging-port=${port}`, 'about:blank'], { stdio: 'ignore' });
  try {
    let target;
    for (let i = 0; i < 80 && !target; i++) {
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

async function evaluate(send, expression) {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails));
  return r.result?.result?.value;
}

async function open(send, base, query, [w, h], theme) {
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 2, mobile: true });
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: theme }] });
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Page.navigate', { url: `${base}?demo&theme=${theme}${query ? '&' + query : ''}` });
  for (let i = 0; i < 100; i++) {
    await sleep(100);
    if (await evaluate(send, '!!document.querySelector(".card, .end")')) break;
  }
  await evaluate(send, PAGE);
  await sleep(800);
}

async function shot(out, base, name, size, theme) {
  const sc = SCENES[name];
  return withChrome(async (send) => {
    await open(send, base, sc.q, SIZES[size], theme);
    if (sc.run) await evaluate(send, `(async () => { ${sc.run} })()`);
    await sleep(300);
    const res = await send('Page.captureScreenshot', { format: 'png' });
    const file = join(out, `${name}-${size}-${theme}.png`);
    writeFileSync(file, Buffer.from(res.result.data, 'base64'));
    return file;
  });
}

/** Play whole runs through the real UI on every exercise type and check what a first-time user would see. */
async function flow(base) {
  return withChrome(async (send) => {
    await open(send, base, `force=${FORCE}`, SIZES[390], 'light');
    const problems = [];
    const check = async (label) => {
      const r = await evaluate(send, `(() => {
        const out = [];
        const app = document.getElementById('app');
        const card = app.querySelector('.card'), act = app.querySelector('.act'), top = app.querySelector('.top');
        if (!top || !card || !act) out.push('missing zone');
        if (card && !card.querySelector('.kind')) out.push('no kind label');
        if (app.scrollWidth > app.clientWidth + 1) out.push('horizontal overflow');
        if (card && card.getBoundingClientRect().height < 80) out.push('card collapsed');
        if (!app.querySelector('.run')) out.push('no run label');
        return out;
      })()`);
      for (const p of r) problems.push(`${label}: ${p}`);
    };
    const seen = [];
    for (let i = 0; i < 10; i++) {
      await check(`card ${i + 1}`);
      const t = await evaluate(send, 'window.__answer(' + (i % 4 === 3) + ')');
      seen.push(t);
    }
    const sum = await evaluate(send, '!!document.querySelector(".sum")');
    if (!sum) problems.push('no summary after the last card');
    const text = await evaluate(send, 'document.getElementById("app").innerText');
    for (const bad of [/streak/i, /überfällig/i, /rückstand/i, /verpasst/i]) if (bad.test(text)) problems.push(`forbidden text: ${bad}`);
    return { seen, problems, summary: text.split('\n').slice(0, 8).join(' | ') };
  });
}

const args = process.argv.slice(2);
if (args[0] === '--flow') {
  const res = await flow(args[1] ?? 'http://localhost:5199/');
  console.log('types played:', res.seen.join(', '));
  console.log('summary:', res.summary);
  console.log(res.problems.length ? 'PROBLEMS:\n' + res.problems.join('\n') : 'flow ok');
  process.exit(res.problems.length ? 1 : 0);
} else {
  const out = args[0];
  const names = !args[1] || args[1] === 'all' ? Object.keys(SCENES) : args[1].split(',');
  const sizes = (args[2] ?? '390,320').split(',');
  const themes = (args[3] ?? 'light,dark').split(',');
  const base = args[4] ?? 'http://localhost:5199/';
  mkdirSync(out, { recursive: true });
  for (const name of names) for (const size of sizes) for (const theme of themes) console.log(await shot(out, base, name, size, theme));
}
