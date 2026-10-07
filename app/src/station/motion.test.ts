import { describe, expect, it } from 'vitest';
import { releaseVelocity, rubberband, springStep } from './motion';
import { splitTarget } from './text';

describe('motion helpers', () => {
  it('rubber band: follows less the further it goes, never passes the surface size, keeps the sign', () => {
    const a = rubberband(50, 600), b = rubberband(200, 600), c = rubberband(5000, 600);
    expect(a).toBeGreaterThan(0);
    expect(b - a).toBeLessThan(150);
    expect(c).toBeLessThan(600);
    expect(rubberband(-50, 600)).toBeCloseTo(-a);
  });
  it('a critically damped spring settles on the target without overshoot', () => {
    let x = -200, v = 0, min = 0;
    for (let i = 0; i < 240; i++) { ({ x, v } = springStep(x, v, 0, 1 / 120, { damping: 1, response: 0.38 })); min = Math.max(min, x); }
    expect(Math.abs(x)).toBeLessThan(0.5);
    expect(min).toBeLessThan(0.5);
  });
  it('an under-damped spring overshoots a little after a flick', () => {
    let x = 0, v = -3000, lo = 0;
    for (let i = 0; i < 240; i++) { ({ x, v } = springStep(x, v, 0, 1 / 120, { damping: 0.8, response: 0.38 })); lo = Math.min(lo, x); }
    expect(lo).toBeLessThan(-50);
    expect(Math.abs(x)).toBeLessThan(1);
  });
  it('release velocity from the last 100 ms of samples (px/ms, up is negative)', () => {
    const s = [{ y: 500, t: 0 }, { y: 480, t: 50 }, { y: 400, t: 150 }, { y: 300, t: 250 }];
    expect(releaseVelocity(s)).toBeCloseTo(-1, 5);
    expect(releaseVelocity([])).toBe(0);
  });
});

describe('board highlight', () => {
  it('splits around the single whole-word occurrence', () => {
    expect(splitTarget('Wir steigen an der nächsten Haltestelle aus.', 'Haltestelle')).toEqual(['Wir steigen an der nächsten ', 'Haltestelle', ' aus.']);
    expect(splitTarget('Terminkalender', 'Termin')).toBeNull();
    expect(splitTarget('', 'x')).toBeNull();
  });
});
