let enabled = true;
export function setHaptics(on: boolean): void { enabled = on; }
/** Feature-detected; a no-op on devices without vibration. */
export function haptic(ms = 10): void {
  try { if (enabled && navigator.vibrate) navigator.vibrate(ms); } catch { /* not available */ }
}
export const reducedMotion = (): boolean => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
