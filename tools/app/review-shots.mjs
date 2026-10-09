/**
 * Review screenshots for round 3 (Playwright + the local Chrome, against the dev server).
 * Only committed synthetic data: the demo deck with simulated logs, and the stress fixture. Never the seed.
 *
 *   node tools/app/review-shots.mjs <out-dir> [base=http://localhost:5288/]
 * Run from app/ (it imports @playwright/test from app/node_modules).
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(join(process.cwd(), 'package.json'));
const { chromium } = require('@playwright/test');
const out = process.argv[2] ?? 'review';
const base = process.argv[3] ?? 'http://localhost:5288/';
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome' });
const sizes = { '320': [320, 600], '390': [390, 844] };
const shots = [];

async function shot(name, url, size, theme, after) {
  const [w, h] = sizes[size];
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2, colorScheme: theme });
  await page.goto(`${base}${url}${url.includes('?') ? '&' : '?'}theme=${theme}`);
  await page.waitForSelector('.card, .end, .sum, .page');
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  if (after) await after(page);
  await page.evaluate(() => document.getAnimations().forEach((a) => { try { a.finish(); } catch { a.cancel(); } }));
  await page.waitForTimeout(150);
  const file = join(out, `${name}-${size}-${theme}.png`);
  await page.screenshot({ path: file });
  shots.push(file);
  await page.close();
}

const toVerlauf = async (page) => {
  await page.getByRole('button', { name: 'Fertig' }).click().catch(() => {});
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: 'Verlauf' }).click();
  await page.waitForSelector('.page');
  await page.waitForTimeout(300);
};
const scrollPage = (y) => async (page) => { await toVerlauf(page); await page.evaluate((y) => { document.querySelector('.page').scrollTop = y; }, y); };
const reveal = async (page) => { await page.click('.flap'); await page.waitForTimeout(800); };
const pickRight = async (page) => {
  await page.evaluate(() => { const x = window.__card.exercise; [...document.querySelectorAll('.tag')].find((t) => t.textContent.trim() === x.answer)?.click(); });
  await page.waitForTimeout(1300);
};

for (const theme of ['light', 'dark']) {
  for (const size of ['320', '390']) {
    for (const log of ['empty', '3d', '30d', 'spiky']) await shot(`verlauf-${log}`, `?demo&log=${log}`, size, theme, toVerlauf);
    await shot('verlauf-30d-lower', '?demo&log=30d', size, theme, scrollPage(700));
    await shot('stress-karte', '?sheet=stress&force=karte&pick=longest', size, theme, reveal);
    await shot('stress-bedeutung', '?sheet=stress&force=bedeutung&pick=longest', size, theme);
    await shot('stress-luecke', '?sheet=stress&force=luecke&pick=longest', size, theme, pickRight);
    await shot('stress-kollokation', '?sheet=stress&force=kollokation&pick=longest', size, theme);
    await shot('stress-reihenfolge', '?sheet=stress&force=reihenfolge&pick=longest', size, theme);
    await shot('stress-hoeren', '?sheet=stress&force=hoeren&pick=longest', size, theme);
    await shot('stress-daten', '?sheet=stress', size, theme, async (page) => {
      await page.getByRole('button', { name: 'Fertig' }).click();
      await page.getByRole('button', { name: 'Einstellungen' }).click();
      await page.getByRole('button', { name: /Daten/ }).click();
      await page.waitForTimeout(400);
    });
  }
}
await browser.close();
console.log(shots.join('\n'));
