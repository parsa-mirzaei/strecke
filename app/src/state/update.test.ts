import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { SKIP_WAITING, Updater, type ContainerLike, type RegistrationLike, type WorkerLike } from './update';

function worker(state = 'installed'): WorkerLike & { sent: unknown[]; fire(): void } {
  const fns: Array<() => void> = [];
  return { state, sent: [], postMessage(m) { this.sent.push(m); }, addEventListener: (_t, f) => fns.push(f), fire: () => fns.forEach((f) => f()) };
}
function setup(opts: { controlled?: boolean; waiting?: boolean } = {}) {
  const changes: Array<() => void> = [];
  const container: ContainerLike = { controller: opts.controlled === false ? null : {}, addEventListener: (_t, f) => changes.push(f) };
  const found: Array<() => void> = [];
  const reg: RegistrationLike & { found(): void } = {
    waiting: opts.waiting ? worker() : null, installing: null, active: worker('activated'),
    addEventListener: (_t, f) => found.push(f), update: vi.fn(async () => undefined), found: () => found.forEach((f) => f()),
  };
  const reload = vi.fn();
  const u = new Updater(container, reload);
  return { u, reg, reload, takeOver: () => changes.forEach((f) => f()) };
}

describe('update available: never during a run', () => {
  it('a new build that finished installing is reported, nothing is applied', () => {
    const { u, reg, reload } = setup();
    const seen: boolean[] = [];
    u.subscribe((w) => seen.push(w));
    u.watch(reg);
    const w = worker('installing');
    reg.installing = w;
    reg.found();
    w.state = 'installed';
    w.fire();
    expect(seen).toEqual([false, true]);
    expect(w.sent).toEqual([]); // no skipWaiting sent
    expect(reload).not.toHaveBeenCalled();
  });

  it('a takeover this page did not ask for (another tab, the browser) never reloads it: an active run goes on', () => {
    const { u, reg, reload, takeOver } = setup({ waiting: true });
    u.watch(reg);
    takeOver();
    expect(reload).not.toHaveBeenCalled();
  });

  it('a tap sends skipWaiting and reloads once the new build has taken over', () => {
    const { u, reg, reload, takeOver } = setup({ waiting: true });
    u.watch(reg);
    expect(u.waiting).toBe(true);
    u.apply();
    expect((reg.waiting as ReturnType<typeof worker>).sent).toEqual([SKIP_WAITING]);
    expect(reload).not.toHaveBeenCalled();
    takeOver();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('at app start a waiting build is applied before the first card', () => {
    const { u, reg } = setup({ waiting: true });
    expect(u.applyAtStart(reg)).toBe(true);
    expect((reg.waiting as ReturnType<typeof worker>).sent).toEqual([SKIP_WAITING]);
    expect(setup().u.applyAtStart(setup().reg)).toBe(false); // nothing waiting: start normally
  });

  it('the first install is not an update (no page was controlled)', () => {
    const { u, reg } = setup({ controlled: false, waiting: true });
    u.watch(reg);
    expect(u.waiting).toBe(false);
  });

  it('checks for a new build at most hourly', () => {
    const { u, reg } = setup();
    u.watch(reg);
    u.check(10_000_000); u.check(10_000_000 + 60_000); u.check(10_000_000 + 3_600_000);
    expect(reg.update).toHaveBeenCalledTimes(2);
  });

  it('the run screens never show the update row', () => {
    const dir = join(__dirname, '..', 'run');
    for (const f of readdirSync(dir)) expect(readFileSync(join(dir, f), 'utf8'), f).not.toMatch(/UpdateRow|state\/update/);
  });

  it('the service worker waits: no skipWaiting on install, only on the page\'s message', () => {
    const src = readFileSync(join(__dirname, '..', '..', 'vite.config.ts'), 'utf8');
    const install = src.slice(src.indexOf("addEventListener('install'"), src.indexOf("addEventListener('activate'"));
    expect(install).toContain("e.data === 'skipWaiting'");
    expect(install.split("self.addEventListener('message'")[0]).not.toContain('self.skipWaiting()');
  });
});
