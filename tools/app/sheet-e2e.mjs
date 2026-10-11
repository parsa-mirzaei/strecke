// End-to-end check of the sheet connection (Round 4, slice 3) in headless Chromium, against a FAKE
// Google: every request to docs.google.com is answered locally with synthetic CSV, so no real sheet
// and no network are involved. Optional screenshots go to the output folder.
//
//   cd app && npm run build && npx vite preview --port 4173 &
//   PLAYWRIGHT=/path/to/playwright node tools/app/sheet-e2e.mjs http://localhost:4173/ [out-dir]
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const [base = 'http://localhost:4173/', out] = process.argv.slice(2);
if (out) mkdirSync(out, { recursive: true });

const KEY = '2PACX-placeholderkey';
const WORDS = `https://docs.google.com/spreadsheets/d/e/${KEY}/pub?gid=0&single=true&output=csv`;
let csv = [
  'word,article,meaning,pos,example,example_translation,source,added,level',
  'Schrank,,wardrobe,noun,Der Schrank ist voll.,The wardrobe is full.,me,2026-10-01,A2',
  'Rechnung,die,bill,noun,Die Rechnung kommt morgen.,The bill comes tomorrow.,agent,2026-10-10,A2',
  'abholen,,to pick up,verb,Kannst du mich abholen?,Can you pick me up?,agent,2026-10-10,A2',
  'Teller,der,plate,noun,,,me,,',
  'Gabel,die,,noun,,,me,,',
  'müde,,tired,adj,Ich bin müde.,I am tired.,me,,',
].join('\n');

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
await ctx.route('https://docs.google.com/**', (route) => {
  const url = route.request().url();
  if (url === WORDS) return route.fulfill({ status: 200, headers: { 'content-type': 'text/csv; charset=utf-8', 'access-control-allow-origin': '*' }, body: csv });
  return route.fulfill({ status: 200, headers: { 'content-type': 'text/html', 'access-control-allow-origin': '*' }, body: '<!DOCTYPE html><html>Sign in</html>' });
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
const shot = async (name) => out && page.screenshot({ path: `${out}/${name}.png`, fullPage: true });

await page.goto(base);
await page.waitForSelector('.card');
assert.match(await page.textContent('.source-line'), /Demo words/);
await shot('run-start-demo');

// Connect: the sheet's own address is explained, a published link connects.
await page.click('.source-line .link');
await page.waitForSelector('.settings');
await shot('data-not-connected');
await page.fill('.connect input[type=url] >> nth=0', 'https://docs.google.com/spreadsheets/d/abc123/edit#gid=0');
await page.click('.connect button[type=submit]');
await page.waitForSelector('[role=alert]');
assert.match(await page.textContent('[role=alert]'), /own address/);
await page.fill('.connect input[type=url] >> nth=0', `https://docs.google.com/spreadsheets/d/e/${KEY}/pubhtml?gid=0&single=true`);
await page.click('.connect button[type=submit]');
await page.waitForSelector('text=Connected:');
const summary = await page.textContent('#data');
assert.match(summary, /Connected: 5 rows, 2 need attention/); // Schrank: article missing; Gabel: meaning missing
assert.match(summary, /Your sheet · 5 words · synced/);
await page.click('.attention summary');
await shot('data-connected');
const att = await page.textContent('.attention');
assert.match(att, /Row 2 · Schrank: article missing/);
assert.match(att, /Row 6 · Gabel: meaning missing · not practised/);

// Back to practice: the first card names the sheet.
await page.click('.screen-top .icon-btn');
await page.waitForSelector('.card');
await page.click('.top .icon-btn');
await page.click('.screen-top .icon-btn');
await page.waitForSelector('.card');
assert.match(await page.textContent('.source-line'), /Your sheet · 5 words · synced/);
await shot('run-start-sheet');

// New rows arrive: Sync now announces them calmly.
csv += '\nLampe,die,lamp,noun,,,agent,2026-10-11,A2\nKissen,das,pillow,noun,,,agent,2026-10-11,A2';
await page.click('.top .icon-btn');
await page.click('text=Sync now');
await page.waitForSelector('text=Up to date.');
await page.click('.screen-top .icon-btn');
await page.waitForSelector('.toast');
assert.match(await page.textContent('.toast'), /2 new words from your sheet/);

// An unpublished tab: the last good copy stays, the reason is shown.
const saved = csv;
csv = '<!DOCTYPE html><html>not published</html>';
await page.click('.top .icon-btn');
await page.click('text=Sync now');
await page.waitForSelector('#data .status');
assert.match(await page.textContent('#data .status'), /web page instead of CSV/);
assert.match(await page.textContent('#data'), /Your sheet · 7 words/);
csv = saved;

// Disconnect returns to the demo words.
await page.click('text=Disconnect');
await page.click('.plan .primary');
await page.waitForSelector('.connect');
assert.match(await page.textContent('#data'), /Demo words/);

assert.deepEqual(errors, []);
await browser.close();
console.log('sheet e2e: all checks passed');
