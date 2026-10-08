/**
 * Motion and haptics for Station (STATION.md "Motion and feel"). No animation library: the Web
 * Animations API for scripted moves, a tiny spring for gesture releases, CSS for press feedback.
 */

export const EASE_CARD = 'cubic-bezier(0.22, 0.9, 0.28, 1.02)';
export const EASE_OUT = 'cubic-bezier(0.23, 1, 0.32, 1)';
export const EASE_DRAWER = 'cubic-bezier(0.32, 0.72, 0, 1)';

export const DUR = {
  cardEnter: 680,
  cardExit: 340,
  coverLift: 700,
  detailsDelay: 260,
  detailsStagger: 70,
  reduced: 200,
} as const;

/** Distance a new card rises from (px), for the default profile. */
export const ENTER_OFFSET = 48;

export interface MotionProfile {
  enter: number;
  enterOffset: number;
  enterEase: string;
  exit: number;
  cover: number;
  coverEase: string;
  coverFrames: Keyframe[];
  detailsDelay: number;
}

/**
 * Motion character per visual style (DECISIONS D50). Same mechanics everywhere (interruptible, swipe
 * physics, reduced motion); only pacing and the cover's gesture differ.
 */
const PROFILES: Record<string, MotionProfile> = {
  // Anzeiger: a display flap. Crisp and mechanical; the cover folds up on its top edge.
  '1': {
    enter: 380, enterOffset: 20, enterEase: EASE_OUT, exit: 240,
    cover: 420, coverEase: 'cubic-bezier(0.55, 0, 0.1, 1)',
    coverFrames: [{ transform: 'perspective(600px) rotateX(0deg)', opacity: 1 }, { transform: 'perspective(600px) rotateX(-92deg)', opacity: 0.2 }],
    detailsDelay: 160,
  },
  // Emaille: an enamel plate. Calm, with weight; the cover slides aside like a plate on a rail.
  '2': {
    enter: 560, enterOffset: 40, enterEase: EASE_CARD, exit: 320,
    cover: 560, coverEase: EASE_DRAWER,
    coverFrames: [{ transform: 'translateX(0)' }, { transform: 'translateX(calc(100% + 24px))' }],
    detailsDelay: 220,
  },
  // Klartext: type only. Quick and soft; the amber blank wipes away left to right like ink lifting.
  '3': {
    enter: 420, enterOffset: 14, enterEase: EASE_OUT, exit: 260,
    cover: 380, coverEase: EASE_OUT,
    coverFrames: [{ clipPath: 'inset(0 0 0 0)' }, { clipPath: 'inset(0 0 0 100%)' }],
    detailsDelay: 140,
  },
};

export function profile(): MotionProfile {
  const s = typeof document === 'undefined' ? '2' : document.documentElement.dataset.style ?? '2';
  return PROFILES[s] ?? PROFILES['2']!;
}

export function reducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Soft boundary: the further past the edge, the less the element follows (Apple's rubber band).
 * `overshoot` and the result are in px; `dimension` is the size of the moving surface.
 */
export function rubberband(overshoot: number, dimension: number, constant = 0.55): number {
  const sign = Math.sign(overshoot);
  const o = Math.abs(overshoot);
  return (sign * (o * dimension * constant)) / (dimension + constant * o);
}

/** Release velocity (px/ms, negative = upwards) from the last ~100 ms of pointer samples. */
export function releaseVelocity(samples: ReadonlyArray<{ y: number; t: number }>, window = 100): number {
  const last = samples[samples.length - 1];
  if (!last) return 0;
  let first = last;
  for (let i = samples.length - 1; i >= 0; i--) {
    first = samples[i]!;
    if (last.t - first.t >= window) break;
  }
  const dt = last.t - first.t;
  return dt > 0 ? (last.y - first.y) / dt : 0;
}

export interface SpringOptions {
  /** Damping ratio: 1 = no overshoot; below 1 bounces. */
  damping?: number;
  /** Seconds to reach the target, roughly (Apple's "response"). */
  response?: number;
}

/**
 * One step of a damped spring (semi-implicit Euler). Position in px, velocity in px/s, dt in s.
 * Pure, so it can be tested; `animateSpring` drives it frame by frame.
 */
export function springStep(x: number, v: number, target: number, dt: number, { damping = 1, response = 0.4 }: SpringOptions = {}) {
  const k = (2 * Math.PI / response) ** 2;
  const c = (4 * Math.PI * damping) / response;
  const a = -k * (x - target) - c * v;
  const nv = v + a * dt;
  return { x: x + nv * dt, v: nv };
}

/**
 * Animate a value with a spring, starting from the current value and velocity (so a gesture hands off
 * without a seam). Returns a cancel function; cancelling leaves the value where it is.
 */
export function animateSpring(
  from: number, target: number, velocityPxPerMs: number, apply: (x: number) => void,
  opts: SpringOptions = {}, done?: () => void,
): () => void {
  let x = from, v = velocityPxPerMs * 1000, last = performance.now(), raf = 0, live = true;
  const frame = (now: number) => {
    if (!live) return;
    // Integrate in small steps so a dropped frame cannot blow the spring up.
    let dt = Math.min(0.064, (now - last) / 1000);
    last = now;
    while (dt > 0) {
      const h = Math.min(dt, 1 / 240);
      ({ x, v } = springStep(x, v, target, h, opts));
      dt -= h;
    }
    if (Math.abs(x - target) < 0.4 && Math.abs(v) < 8) {
      apply(target);
      live = false;
      done?.();
      return;
    }
    apply(x);
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  return () => { live = false; cancelAnimationFrame(raf); };
}

/** The element's live translateY (px), read from the computed transform. */
export function currentY(el: HTMLElement): number {
  const m = getComputedStyle(el).transform;
  if (!m || m === 'none') return 0;
  return new DOMMatrixReadOnly(m).m42;
}

/* ---------------------------------------------------------------- haptics */

let hapticsOn = true;
export function setHaptics(on: boolean): void { hapticsOn = on; }

/** Vibration API where available (Android Chrome). Feature-detected; never relied on. */
function vibrate(pattern: number | number[]): void {
  if (!hapticsOn || typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
  try { navigator.vibrate(pattern); } catch { /* not allowed right now: stay silent */ }
}

export const haptic = {
  /** Cover lifted. */
  reveal: () => vibrate(8),
  /** Right answer. */
  right: () => vibrate(12),
  /** Wrong answer: a soft double pulse, never a buzz. */
  wrong: () => vibrate([8, 60, 8]),
};
