import { expect, test, type Page } from '@playwright/test';
import { de } from '../src/i18n/de';
import { en } from '../src/i18n/en';

/**
 * Layout checks for every exercise type on the stress fixture (round 3, section 3): no horizontal
 * overflow, no clipped text, nothing outside its zone (route on top, card in the middle, actions at
 * the thumb). Each type is shown with the stress row whose exercise carries the most text.
 * Round 4 port: every check runs in both interface languages (en, de) and both schemes (light, dark),
 * at four phone sizes and text at 100 % and 130 %, plus the connected-sheet screens.
 */
const LANGS = { en, de } as const;
type Lang = keyof typeof LANGS;
const THEMES = ['light', 'dark'] as const;
const TYPES = ['karte', 'artikel', 'plural', 'bedeutung', 'luecke', 'praeposition', 'kollokation', 'hoeren', 'tippen', 'reihenfolge', 'kontext2'];
const SIZES: Array<[number, number]> = [[320, 600], [360, 740], [390, 844], [430, 932]];

/** In-page audit; returns a list of problems (empty = pass). */
async function audit(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    document.getAnimations().forEach((a) => { try { a.finish(); } catch { a.cancel(); } });
    const out: string[] = [];
    const desc = (el: Element) => `${el.tagName.toLowerCase()}.${[...el.classList].join('.')} "${(el.textContent ?? '').trim().slice(0, 30)}"`;
    const vw = innerWidth, vh = innerHeight;
    const app = document.getElementById('app')!;
    const ar = app.getBoundingClientRect();
    if (document.documentElement.scrollWidth > vw + 1) out.push('page scrolls sideways');
    const zones = [...app.children].filter((e) => e.matches('.top, .mid, .act, .sum, .page, .end'));
    for (const z of zones) {
      const r = z.getBoundingClientRect();
      if (r.left < ar.left - 1 || r.right > ar.right + 1) out.push(`zone wider than the app: ${desc(z)}`);
      if (r.bottom > vh + 1 || r.top < -1) out.push(`zone outside the screen: ${desc(z)}`);
    }
    for (let i = 1; i < zones.length; i++) if (zones[i]!.getBoundingClientRect().top < zones[i - 1]!.getBoundingClientRect().bottom - 1) out.push('zones overlap');
    for (const el of app.querySelectorAll('*')) {
      if (el.closest('.sr-only, .fly') || el.tagName === 'INPUT' || el.closest('svg')) continue;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || cs.display === 'contents') continue;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      if (r.left < ar.left - 1 || r.right > ar.right + 1) out.push(`sticks out sideways: ${desc(el)}`);
      const zone = el.closest('.top, .mid, .act, .sum, .page, .end');
      const scroller = el.closest('.mid, .page, .tags, .chips, .sum, .end');
      if (zone && !scroller) {
        const zr = zone.getBoundingClientRect();
        if (r.top < zr.top - 1 || r.bottom > zr.bottom + 1) out.push(`outside its zone: ${desc(el)}`);
      }
      if ((cs.overflowX === 'hidden' || cs.overflowX === 'clip') && el.scrollWidth > el.clientWidth + 1) out.push(`text clipped sideways: ${desc(el)}`);
      if ((cs.overflowY === 'hidden' || cs.overflowY === 'clip') && el.scrollHeight > el.clientHeight + 1) out.push(`text clipped: ${desc(el)}`);
      if (el.children.length === 0 && (el.textContent ?? '').trim() && cs.display !== 'inline' && el.scrollWidth > el.clientWidth + 1) out.push(`text wider than its box: ${desc(el)}`);
      if (el.matches('button, .lbl') && !el.matches('.flap') && el.scrollWidth > el.clientWidth + 2) out.push(`text wider than its button: ${desc(el)}`);
      if (el.matches('button, .tag, .ch, .chip, .slot') && !el.matches('.flap') && cs.overflowY === 'visible' && el.scrollHeight > el.clientHeight + 2) out.push(`text taller than its box: ${desc(el)}`);
      // Words of a control label must not break in the middle (long compounds in content may).
      if (el.matches('.ch .lbl, .primary, .ghost, .small-btn, .quiet, .kind, .run, .hint') && el.firstChild?.nodeType === 3) {
        const t = el.firstChild as Text;
        let at = 0;
        for (const word of t.data.split(/\s+/)) {
          const i = t.data.indexOf(word, at); at = i + word.length;
          if (!word || i < 0) continue;
          const rg = document.createRange(); rg.setStart(t, i); rg.setEnd(t, i + word.length);
          if (rg.getClientRects().length > 1) { out.push(`label word broken: ${desc(el)} "${word}"`); break; }
        }
      }
    }
    return [...new Set(out)];
  });
}

/** Emulates the Android text-size setting: every font grows by `f` (boxes do not), then fitting re-runs. */
async function scaleText(page: Page, f: number) {
  await page.evaluate((f) => {
    for (const el of document.querySelectorAll<HTMLElement>('#app *:not([data-scaled])')) { el.style.fontSize = `${parseFloat(getComputedStyle(el).fontSize) * f}px`; el.dataset.scaled = ''; }
    dispatchEvent(new Event('resize'));
  }, f);
  await page.waitForTimeout(100);
}

async function open(page: Page, url: string) {
  await page.goto(url);
  await page.waitForSelector('.card, .end, .sum, .page');
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(250);
}

/** Answer the card through its own buttons, so the "after" state is audited too. */
async function answer(page: Page) {
  await page.evaluate(async () => {
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const x = (window as unknown as { __card: { exercise: { type: string; answer: string } } }).__card.exercise;
    if (x.type === 'karte') { (document.querySelector('.flap') as HTMLElement).click(); await sleep(700); return; }
    if (x.type === 'tippen') {
      const i = document.querySelector('input.slot') as HTMLInputElement;
      i.value = x.answer; i.dispatchEvent(new Event('input', { bubbles: true })); await sleep(50);
      [...document.querySelectorAll('button')].find((b) => /^(Check|Prüfen)$/.test(b.textContent ?? ''))!.click(); await sleep(300); return;
    }
    if (x.type === 'reihenfolge') {
      for (const t of x.answer.split(' ')) {
        [...document.querySelectorAll<HTMLButtonElement>('.chips .chip')].find((b) => !b.classList.contains('used') && b.textContent === t)?.click();
        await sleep(20);
      }
      [...document.querySelectorAll('button')].find((b) => /^(Check|Prüfen)$/.test(b.textContent ?? ''))!.click(); await sleep(300); return;
    }
    [...document.querySelectorAll<HTMLElement>('.tag')].find((t) => t.textContent!.trim() === x.answer)?.click();
    await sleep(1300);
  });
}

for (const lang of Object.keys(LANGS) as Lang[]) {
  for (const theme of THEMES) {
    for (const [w, h] of SIZES) {
      for (const scale of [1, 1.3]) {
        test(`all types, ${lang}, ${theme}, ${w}x${h}, text ${scale * 100}%`, async ({ page }) => {
          await page.setViewportSize({ width: w, height: h });
          for (const type of TYPES) {
            await open(page, `/?sheet=stress&force=${type}&pick=longest&lang=${lang}&theme=${theme}`);
            if (scale !== 1) await scaleText(page, scale);
            expect(await audit(page), `${type} before answering`).toEqual([]);
            await answer(page);
            expect(await audit(page), `${type} after answering`).toEqual([]);
          }
        });
      }
    }
  }
}

/** Clicks through the screens around a run and audits each one. */
async function screens(page: Page, lang: Lang, scale: number, demo: boolean) {
  const L = LANGS[lang];
  const q = `/?${demo ? "demo" : "sheet=stress500&tabs=1"}&force=bedeutung&lang=${lang}`; // one answered card, then the summary
  const out: Array<[string, string[]]> = [];
  const check = async (name: string) => { if (scale !== 1) await scaleText(page, scale); out.push([name, await audit(page)]); };
  await open(page, q);
  await answer(page);
  await page.getByRole('button', { name: L['common.done'], exact: true }).click();
  await page.waitForSelector('.sum');
  await check('summary');
  await page.locator('.act').getByRole('button', { name: L['common.done'], exact: true }).click();
  await page.waitForSelector('.end');
  await check('end');
  await page.getByRole('button', { name: L['nav.settings'] }).first().click();
  await page.waitForSelector('.page');
  await check('settings');
  const openPage = async (key: 'set.page.uebungen' | 'set.page.sheet' | 'set.page.fill' | 'set.page.daten', name: string) => {
    await page.getByRole('button', { name: new RegExp(`^${L[key]}`) }).click();
    await page.waitForSelector('.page');
    await page.evaluate(() => document.querySelectorAll('details').forEach((d) => { d.open = true; }));
    await check(name);
    await page.locator('.top').getByRole('button').first().click(); // back to the menu
    await page.waitForSelector('.menu');
  };
  await openPage('set.page.uebungen', 'practice');
  await openPage('set.page.sheet', 'sheet');
  // Fill my list, after "Generate now" (copied, with the assistant links, or the copy-failed note).
  await page.getByRole('button', { name: new RegExp(`^${L['set.page.fill']}`) }).click();
  await page.waitForSelector('.prompt-out');
  await page.getByRole('button', { name: L['fill.generate'], exact: true }).click();
  await page.waitForSelector('[role=status]');
  await check('fill');
  await page.locator('.top').getByRole('button').first().click();
  await page.waitForSelector('.menu');
  await openPage('set.page.daten', 'data');
  return out;
}

/** Two snapshots in this dev build's snapshot database, so the Data page lists them. */
async function seedSnapshots(page: Page) {
  await page.goto('/?demo');
  await page.evaluate(() => new Promise<void>((resolve) => {
    const r = indexedDB.open('strecke-snapshots', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('snapshots', { keyPath: 'id', autoIncrement: true });
    r.onsuccess = () => {
      const tx = r.result.transaction('snapshots', 'readwrite');
      tx.objectStore('snapshots').clear();
      for (const at of [Date.UTC(2026, 9, 1), Date.UTC(2026, 9, 15)]) tx.objectStore('snapshots').add({ at, from: 2, to: 3, dump: { meta: [], events: [] } });
      tx.oncomplete = () => { r.result.close(); resolve(); };
    };
  }));
}

for (const lang of Object.keys(LANGS) as Lang[]) {
  for (const theme of THEMES) {
    for (const [w, h] of SIZES) {
      for (const scale of [1, 1.3]) {
        for (const demo of [false, true]) {
          test(`screens (${demo ? 'demo' : 'connected sheet, 500 rows'}), ${lang}, ${theme}, ${w}x${h}, text ${scale * 100}%`, async ({ page, context }) => {
            await context.grantPermissions(['clipboard-read', 'clipboard-write']);
            await page.emulateMedia({ colorScheme: theme });
            await page.setViewportSize({ width: w, height: h });
            await seedSnapshots(page);
            for (const [name, problems] of await screens(page, lang, scale, demo)) expect(problems, name).toEqual([]);
          });
        }
      }
    }
  }
}

for (const lang of Object.keys(LANGS) as Lang[]) {
  for (const theme of THEMES) {
    for (const [w, h] of SIZES) {
      for (const scale of [1, 1.3]) {
        test(`update row and version-guard screen, ${lang}, ${theme}, ${w}x${h}, text ${scale * 100}%`, async ({ page }) => {
          await page.emulateMedia({ colorScheme: theme });
          await page.setViewportSize({ width: w, height: h });
          await open(page, `/?demo&update=1&force=bedeutung&lang=${lang}`);
          await answer(page);
          await page.getByRole('button', { name: LANGS[lang]['common.done'], exact: true }).click();
          await page.locator('.act').getByRole('button', { name: LANGS[lang]['common.done'], exact: true }).click();
          await page.waitForSelector('.update-row');
          if (scale !== 1) await scaleText(page, scale);
          expect(await audit(page), 'end with update row').toEqual([]);
          await open(page, `/?newer=1&lang=${lang}`);
          if (scale !== 1) await scaleText(page, scale);
          expect(await audit(page), 'newer data').toEqual([]);
          await expect(page.getByRole('button', { name: LANGS[lang]['newer.export'] })).toBeVisible();
        });
      }
    }
  }
}

test('Verlauf on 500 rows, both languages, 320x600', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 600 });
  for (const lang of Object.keys(LANGS) as Lang[]) {
    await open(page, `/?sheet=stress500&lang=${lang}`);
    await page.getByRole('button', { name: LANGS[lang]['common.done'], exact: true }).click();
    await page.getByRole('button', { name: LANGS[lang]['nav.verlauf'] }).first().click();
    await page.waitForSelector('.page');
    expect(await audit(page), `verlauf ${lang}`).toEqual([]);
  }
});

test('control: the audit does catch overflow, clipping and zone breaks', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 600 });
  await open(page, '/?sheet=stress&force=karte&pick=longest');
  await page.evaluate(() => {
    const w = document.querySelector('.word') as HTMLElement;
    w.classList.remove('wrap'); w.style.fontSize = '72px'; w.style.whiteSpace = 'nowrap';
    const h = document.querySelector('.hint') as HTMLElement;
    h.style.overflow = 'hidden'; h.style.height = '4px';
    (document.querySelector('.choices') as HTMLElement).style.transform = 'translateY(-300px)';
  });
  const problems = await audit(page);
  expect(problems.some((p) => p.startsWith('sticks out sideways') || p.startsWith('text wider'))).toBe(true);
  expect(problems.some((p) => p.startsWith('text clipped'))).toBe(true);
  expect(problems.some((p) => p.startsWith('outside its zone') || p.startsWith('zone outside'))).toBe(true);
});

// The learner's own seed (gitignored, served only by the dev server): the same audit, no screenshots kept.
// Runs only with REAL=1 so a clean checkout never needs private data.
test.describe('real seed', () => {
  test.skip(!process.env.REAL, 'set REAL=1 to run on the local seed');
  for (const [w, h] of [[320, 600], [390, 844]] as const) {
    test(`every type on the real rows at ${w}x${h}`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      for (const type of TYPES) {
        await open(page, `/?force=${type}&pick=longest`);
        expect(await audit(page), type).toEqual([]);
        await answer(page);
        expect(await audit(page), `${type} answered`).toEqual([]);
      }
    });
  }
});
