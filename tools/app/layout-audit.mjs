// Layout audit (Round 4): drives the built app in headless Chromium at several phone sizes, text
// scales, themes and UI languages, and reports horizontal overflow, clipped button labels and small
// tap targets. Screenshots go to the output folder. Desktop emulation is not evidence for feel or
// timing (CLAUDE.md); this only catches layout breakage before the phone check.
//
//   cd app && npm run build && npx vite preview --port 4173 &
//   PLAYWRIGHT=/path/to/playwright node tools/app/layout-audit.mjs http://localhost:4173/ out-dir [--quick]
//
// Needs Playwright with a Chromium build; it is not a repo dependency.
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const [base = 'http://localhost:4173/', out = 'layout-audit', flag] = process.argv.slice(2);
mkdirSync(out, { recursive: true });

const VIEWPORTS = [[320, 600], [360, 740], [390, 844], [430, 932]];
const SCALES = [100, 130];
const THEMES = ['light', 'dark'];
const LOCALES = ['en', 'de'];

/** Problems on the current screen. */
async function check(page) {
  return page.evaluate(() => {
    const W = window.innerWidth;
    const out = [];
    if (document.documentElement.scrollWidth > W + 1) out.push(`page scrolls sideways (${document.documentElement.scrollWidth} > ${W})`);
    for (const el of document.querySelectorAll('body *')) {
      if (el.closest('.cover-slot, .sr-only, [hidden]')) continue;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      if (r.right > W + 1 || r.left < -1) out.push(`outside viewport: ${el.tagName.toLowerCase()}.${el.className} (${Math.round(r.left)}–${Math.round(r.right)})`);
    }
    for (const el of document.querySelectorAll('button, a, input, textarea, select, [role=radio]')) {
      const r = el.getBoundingClientRect();
      if (!r.width) continue;
      if (el.scrollWidth > el.clientWidth + 2 && getComputedStyle(el).overflow !== 'visible') out.push(`clipped label: "${el.textContent.trim().slice(0, 40)}"`);
      if (r.height < 43.5 && !el.matches('input[type=file]')) out.push(`small tap target (${Math.round(r.height)}px): "${(el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 40)}"`);
    }
    return [...new Set(out)];
  });
}

async function setPrefs(page, theme, locale) {
  await page.click('.top .icon-btn');
  await page.waitForSelector('.settings');
  const pick = async (group, i) => page.locator(`#appearance .seg >> nth=${group}`).locator('button').nth(i).click();
  await pick(0, theme === 'light' ? 0 : 1);
  await pick(1, locale === 'en' ? 0 : 1);
  await page.click('.screen-top .icon-btn');
  await page.waitForSelector('.card, .empty');
}

/** Walk through cards until one of each interesting state was seen; screenshot each once. */
async function practiceStates(page, tag, report) {
  const seen = new Set();
  for (let i = 0; i < 24 && seen.size < 4; i++) {
    const cls = await page.$eval('.card', (el) => el.className).catch(() => '');
    if (!cls) break;
    if (await page.$('.cover:not(.is-lifted)')) {
      if (!seen.has('karte')) { seen.add('karte'); await snap(page, `${tag}-karte`, report); }
      await page.click('.cover');
      await page.waitForTimeout(750);
      if (!seen.has('rating')) { seen.add('rating'); await snap(page, `${tag}-rating`, report); }
      await page.click('.rate >> nth=2');
    } else if (await page.$('.gap-input')) {
      await page.fill('.gap-input', 'abc');
      await page.click('.actions .primary, .card-body .primary');
      await page.click('.actions .primary');
    } else if (await page.$('.opt')) {
      if (!seen.has('choice')) { seen.add('choice'); await snap(page, `${tag}-choice`, report); }
      await page.click('.opt >> nth=0');
      await page.waitForTimeout(600);
      if (!seen.has('answered')) { seen.add('answered'); await snap(page, `${tag}-answered`, report); }
      await page.click('.actions .primary');
    } else break;
    await page.waitForTimeout(100);
  }
}

async function snap(page, name, report) {
  await page.waitForTimeout(800); // let the card's enter animation finish (680 ms)
  const problems = await check(page);
  report.push({ name, problems });
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: true });
}

const browser = await chromium.launch();
const report = [];
const quick = flag === '--quick';
for (const [w, h] of quick ? [[320, 600], [390, 844]] : VIEWPORTS) {
  for (const scale of SCALES) {
    for (const theme of quick ? ['light'] : THEMES) {
      for (const locale of LOCALES) {
        const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
        const page = await ctx.newPage();
        await page.goto(base);
        await page.waitForSelector('.card, .empty');
        await setPrefs(page, theme, locale);
        if (scale !== 100) await page.addStyleTag({ content: `html { font-size: ${scale}% !important; }` });
        const tag = `${w}x${h}-${scale}-${theme}-${locale}`;
        await practiceStates(page, tag, report);
        await page.click('.top .icon-btn');
        await page.waitForSelector('.settings');
        await snap(page, `${tag}-settings`, report);
        await ctx.close();
      }
    }
  }
}
await browser.close();
writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 2));
const bad = report.filter((r) => r.problems.length);
console.log(`${report.length} screens checked, ${bad.length} with problems`);
for (const r of bad) console.log(`- ${r.name}\n    ${r.problems.join('\n    ')}`);
process.exit(bad.length ? 1 : 0);
