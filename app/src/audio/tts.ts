/**
 * Browser text-to-speech, German only. One shared instance.
 * Rules from the spec: load voices via `voiceschanged` with a timeout fallback, and start speech
 * only from a user gesture (a tap on a play or speaker control; nothing plays by itself).
 */

export type VoiceStatus = 'loading' | 'ready' | 'none' | 'unsupported';

export interface SpeakOptions {
  rate?: number;
  /** Called with the index of the word being spoken (whitespace-separated words of `text`). */
  onWord?: (index: number) => void;
  onEnd?: () => void;
}

type Listener = (status: VoiceStatus) => void;

class Speech {
  status: VoiceStatus = 'loading';
  voice: SpeechSynthesisVoice | null = null;
  private listeners = new Set<Listener>();
  private timers: number[] = [];
  private token = 0;
  /** onEnd of the utterance in progress; called when it ends or is interrupted. */
  private ending: (() => void) | undefined;

  constructor() {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      this.status = 'unsupported';
      return;
    }
    const synth = window.speechSynthesis;
    const pick = () => {
      const voices = synth.getVoices();
      if (voices.length === 0) return false;
      const de = voices.filter((v) => v.lang?.toLowerCase().replace('_', '-').startsWith('de'));
      this.voice =
        de.find((v) => v.lang === 'de-DE' && v.localService) ??
        de.find((v) => v.lang === 'de-DE') ??
        de[0] ??
        null;
      this.set(this.voice ? 'ready' : 'none');
      return true;
    };
    if (!pick()) {
      synth.addEventListener('voiceschanged', pick);
      // Some engines never fire voiceschanged; decide after a short wait.
      window.setTimeout(() => {
        if (this.status === 'loading' && !pick()) this.set('none');
      }, 1500);
    }
  }

  get available(): boolean {
    return this.status === 'ready';
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  speak(text: string, opts: SpeakOptions = {}): void {
    if (!this.available) {
      opts.onEnd?.();
      return;
    }
    this.stop();
    const token = ++this.token;
    this.ending = opts.onEnd;
    const synth = window.speechSynthesis;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'de-DE';
    if (this.voice) u.voice = this.voice;
    u.rate = opts.rate ?? 1;

    // Word index from character offsets.
    const starts: number[] = [];
    text.replace(/\S+/g, (_m, offset: number) => {
      starts.push(offset);
      return _m;
    });
    const wordAt = (char: number) => {
      let idx = 0;
      for (let i = 0; i < starts.length; i++) if (starts[i]! <= char) idx = i;
      return idx;
    };

    let gotBoundary = false;
    u.onboundary = (e) => {
      if (token !== this.token || e.name === 'sentence') return;
      gotBoundary = true;
      opts.onWord?.(wordAt(e.charIndex));
    };
    u.onstart = () => {
      if (token !== this.token) return;
      opts.onWord?.(0);
      // Engines without boundary events: estimate word timing from length.
      this.timers.push(
        window.setTimeout(() => {
          if (gotBoundary || token !== this.token) return;
          const perChar = 72 / (opts.rate ?? 1);
          starts.forEach((start, i) => {
            this.timers.push(window.setTimeout(() => token === this.token && opts.onWord?.(i), start * perChar));
          });
        }, 350),
      );
    };
    const end = () => {
      if (token !== this.token) return;
      this.clearTimers();
      this.ending = undefined;
      opts.onEnd?.();
    };
    u.onend = end;
    u.onerror = end;
    synth.speak(u);
  }

  stop(): void {
    this.token++;
    this.clearTimers();
    if (this.status !== 'unsupported') window.speechSynthesis.cancel();
    const ending = this.ending;
    this.ending = undefined;
    ending?.();
  }

  private clearTimers() {
    this.timers.forEach((t) => window.clearTimeout(t));
    this.timers = [];
  }

  private set(status: VoiceStatus) {
    this.status = status;
    this.listeners.forEach((fn) => fn(status));
  }
}

export const speech = new Speech();
