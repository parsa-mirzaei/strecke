import { DOMAIN_ORDER, type Domain, type Item, type ItemState, type ReviewEvent } from '../data/types';
import { SAYABLE_STAGE } from './scheduler';

export interface DomainProgress {
  domain: Domain;
  sayable: Item[];
  underway: number;
}

/** Per situation: what the learner can already say (stage ≥ 3) and what is still on its way. */
export function progressByDomain(items: Item[], states: Record<string, ItemState>): DomainProgress[] {
  return DOMAIN_ORDER.map((domain) => {
    const own = items.filter((i) => i.domain === domain && states[i.id]?.status === 'active');
    const sayable = own.filter((i) => states[i.id]!.stage >= SAYABLE_STAGE);
    const underway = own.filter((i) => states[i.id]!.stage > 0 && states[i.id]!.stage < SAYABLE_STAGE).length;
    return { domain, sayable, underway };
  });
}

function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function newToday(events: ReviewEvent[], now: number): number {
  const from = startOfDay(now);
  return events.filter((e) => e.ts >= from && e.card === 'meet').length;
}

/** The last few items answered before this visit, newest last: the trail the feed opens under. */
export function lastAnswered(events: ReviewEvent[], items: Item[], n: number): Item[] {
  const byId = new Map(items.map((i) => [i.id, i]));
  const seen = new Set<string>();
  const out: Item[] = [];
  for (let k = events.length - 1; k >= 0 && out.length < n; k--) {
    const e = events[k]!;
    if (e.grade === 'skip' || e.grade === 'dismiss' || seen.has(e.itemId)) continue;
    const item = byId.get(e.itemId);
    if (!item) continue;
    seen.add(e.itemId);
    out.push(item);
  }
  return out.reverse();
}
