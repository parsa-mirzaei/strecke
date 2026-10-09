import { expect, test, type Page } from '@playwright/test';

/**
 * Layout checks for every exercise type on the stress fixture (round 3, section 3): no horizontal
 * overflow, no clipped text, nothing outside its zone (route on top, card in the middle, actions at
 * the thumb). Each type is shown with the stress row whose exercise carries the most text.
 */
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
      const scroller = el.closest('.mid, .page, .tags, .chips, .sum');
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
    for (const el of document.querySelectorAll<HTMLElement>('#app *')) el.style.fontSize = `${parseFloat(getComputedStyle(el).fontSize) * f}px`;
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
      [...document.querySelectorAll('button')].find((b) => b.textContent === 'Prüfen')!.click(); await sleep(300); return;
    }
    if (x.type === 'reihenfolge') {
      for (const t of x.answer.split(' ')) {
        [...document.querySelectorAll<HTMLButtonElement>('.chips .chip')].find((b) => !b.classList.contains('used') && b.textContent === t)?.click();
        await sleep(20);
      }
      [...document.querySelectorAll('button')].find((b) => b.textContent === 'Prüfen')!.click(); await sleep(300); return;
    }
    [...document.querySelectorAll<HTMLElement>('.tag')].find((t) => t.textContent!.trim() === x.answer)?.click();
    await sleep(1300);
  });
}

for (const [w, h] of SIZES) {
  for (const scale of [1, 1.3]) {
    for (const type of TYPES) {
      test(`${type} at ${w}x${h}, text ${scale * 100}%`, async ({ page }) => {
        await page.setViewportSize({ width: w, height: h });
        await open(page, `/?sheet=stress&force=${type}&pick=longest`);
        if (scale !== 1) await scaleText(page, scale);
        expect(await audit(page), 'before answering').toEqual([]);
        await answer(page);
        expect(await audit(page), 'after answering').toEqual([]);
      });
    }
  }
}

for (const theme of ['dark']) {
  test(`all types in ${theme} at 320x600`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 600 });
    for (const type of TYPES) {
      await open(page, `/?sheet=stress&force=${type}&pick=longest&theme=${theme}`);
      expect(await audit(page), type).toEqual([]);
    }
  });
}

test('other screens on 500 rows at 320x600: end, Verlauf, Einstellungen > Daten', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 600 });
  await open(page, '/?sheet=stress500');
  await page.getByRole('button', { name: 'Fertig' }).click();
  expect(await audit(page), 'end').toEqual([]);
  await page.getByRole('button', { name: 'Verlauf' }).click();
  await page.waitForSelector('.page');
  expect(await audit(page), 'verlauf').toEqual([]);
  await page.getByRole('button', { name: 'Zurück' }).click();
  await page.getByRole('button', { name: 'Einstellungen' }).click();
  await page.getByRole('button', { name: /Daten/ }).click();
  await page.waitForSelector('.page');
  expect(await audit(page), 'daten').toEqual([]);
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
