/**
 * "Update available" (RELEASES.md, docs/design/DECISIONS.md R5-3). A new build's service worker installs in the
 * background and then *waits*; it never takes over by itself. The app applies it only
 *   - when the learner taps the update row (Settings and the end screen, never during a run), or
 *   - at app start, before the first card is shown.
 * A takeover this page did not ask for (another tab applied it) never reloads this page.
 */

export interface WorkerLike { state: string; postMessage(m: unknown): void; addEventListener(t: 'statechange', f: () => void): void }
export interface RegistrationLike {
  waiting: WorkerLike | null;
  installing: WorkerLike | null;
  active: WorkerLike | null;
  addEventListener(t: 'updatefound', f: () => void): void;
  update(): Promise<unknown>;
}
export interface ContainerLike { controller: unknown; addEventListener(t: 'controllerchange', f: () => void): void }

export const SKIP_WAITING = 'skipWaiting';

export class Updater {
  private reg: RegistrationLike | null = null;
  private requested = false;
  private listeners = new Set<(waiting: boolean) => void>();
  waiting = false;

  constructor(private container: ContainerLike, private reload: () => void) {
    container.addEventListener('controllerchange', () => {
      if (this.requested) this.reload();
    });
  }

  /** Follow a registration: a worker that finishes installing while this page is controlled is an update. */
  watch(reg: RegistrationLike): void {
    this.reg = reg;
    if (reg.waiting && this.container.controller) this.set(true);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => {
        if (w.state === 'installed' && this.container.controller) this.set(true);
      });
    });
  }

  /** At app start, before the first card: take a waiting update now. True when the page is about to reload. */
  applyAtStart(reg: RegistrationLike): boolean {
    if (!reg.waiting || !reg.active) return false;
    this.reg = reg;
    this.apply();
    return true;
  }

  /** The learner tapped "Update now". The caller saves pending answers first. */
  apply(): void {
    const w = this.reg?.waiting;
    if (!w) return;
    this.requested = true;
    w.postMessage(SKIP_WAITING);
  }

  /** Ask the browser to look for a new build (on return to the app; at most hourly). */
  private lastCheck = 0;
  check(now = Date.now()): void {
    if (!this.reg || now - this.lastCheck < 3_600_000) return;
    this.lastCheck = now;
    void this.reg.update().catch(() => {});
  }

  subscribe(f: (waiting: boolean) => void): () => void {
    this.listeners.add(f);
    f(this.waiting);
    return () => this.listeners.delete(f);
  }

  private set(v: boolean) {
    this.waiting = v;
    this.listeners.forEach((f) => f(v));
  }
}

/** The page's one updater; null without service workers (dev server, tests, unsupported browsers). */
export let updater: Updater | null = null;
export function initUpdater(container: ContainerLike, reload: () => void): Updater {
  updater = new Updater(container, reload);
  return updater;
}
