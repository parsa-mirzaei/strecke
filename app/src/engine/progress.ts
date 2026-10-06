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

export interface DayStats {
  cards: number;
  /** Recall cards answered "Hatte ich": sentences the learner produced. */
  said: number;
}

export function todayStats(events: ReviewEvent[], now: number): DayStats {
  const from = startOfDay(now);
  const today = events.filter((e) => e.ts >= from && e.card !== 'checkpoint');
  return {
    cards: today.length,
    said: today.filter((e) => e.card === 'recall' && e.grade === 'good').length,
  };
}

export function newToday(events: ReviewEvent[], now: number): number {
  const from = startOfDay(now);
  return events.filter((e) => e.ts >= from && e.card === 'meet').length;
}

/** Days this month with at least one card. Counted, never displayed as a chain. */
export function daysThisMonth(events: ReviewEvent[], now: number): number {
  const d = new Date(now);
  const days = new Set<number>();
  for (const e of events) {
    const t = new Date(e.ts);
    if (t.getFullYear() === d.getFullYear() && t.getMonth() === d.getMonth()) days.add(t.getDate());
  }
  return days.size;
}
