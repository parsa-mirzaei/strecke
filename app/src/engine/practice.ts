/**
 * The app's handle on the core engine (core/src/scheduler.ts, exercises.ts): which card comes next,
 * and what an answer does to the word's state. Holds one visit's session; everything it decides is a
 * pure function of the word records and the event log, so it can be rebuilt at any time (for example
 * after the sheet brings new rows).
 */
import { exercisesFor, type Exercise } from '../../../core/src/exercises.ts';
import type { WordRecord } from '../../../core/src/record.ts';
import {
  afterCard, newSession, pickNext, replay, step, type EngineConfig, type LearnEvent, type Pick, type Session, type WordState,
} from '../../../core/src/scheduler.ts';
import { capabilities } from '../../../core/src/exercises.ts';
import type { Rating } from '../../../core/src/fsrs.ts';

export interface Answer {
  correct: boolean;
  ms: number;
  help?: boolean;
  dontKnow?: boolean;
  chosen?: string;
  /** Karte only: the learner's own report. */
  rating?: Rating;
}

export function randomId(prefix = 'e'): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return `${prefix}_${[...bytes].map((b) => 'abcdefghijklmnopqrstuvwxyz0123456789'[b % 36]).join('')}`;
}

export function startOfDay(now: number): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export class Practice {
  words: WordRecord[] = [];
  states = new Map<string, WordState>();
  session: Session = newSession();
  private exercises = new Map<string, Exercise[]>();
  private events: LearnEvent[] = [];
  private config: EngineConfig;
  private byId = new Map<string, WordRecord>();

  constructor(words: WordRecord[], events: LearnEvent[], config: EngineConfig) {
    this.config = config;
    this.events = [...events];
    this.setWords(words);
  }

  /** Replace the word list (sheet sync, skip, keep). The session and the log are kept. */
  setWords(words: WordRecord[]): void {
    this.words = words;
    this.byId = new Map(words.map((w) => [w.id, w]));
    this.exercises = new Map(words.map((w) => [w.id, exercisesFor(w, words)]));
    this.states = replay(words, this.events, this.config.retention);
  }

  word(id: string): WordRecord | undefined {
    return this.byId.get(id);
  }

  next(now: number, canListen: boolean): Pick | null {
    return pickNext({
      now, dayStart: startOfDay(now), words: this.words, states: this.states, exercises: this.exercises,
      session: this.session, config: this.config, canListen,
    });
  }

  /** Record an answer: returns the event to store; updates state and session at once. */
  answer(pick: Pick, a: Answer, now: number): LearnEvent {
    const isKarte = pick.exercise.type === 'karte';
    const e: LearnEvent = {
      id: randomId(),
      ts: now,
      wordId: pick.word.id,
      kind: isKarte ? 'seen' : 'review',
      exercise: pick.exercise.type,
      correct: a.correct,
      ms: Math.max(0, Math.round(a.ms)),
      help: !!a.help,
      dontKnow: !!a.dontKnow,
      ...(a.chosen !== undefined ? { chosen: a.chosen } : {}),
      ...(isKarte && a.rating ? { rating: a.rating } : {}),
      ...(pick.asGate ? { gate: true } : {}),
    };
    this.events.push(e);
    const st = this.states.get(e.wordId);
    if (st) this.states.set(e.wordId, step(st, e, capabilities(pick.word), this.config.retention));
    this.session = afterCard(this.session, e, pick.word.status === 'pending');
    return e;
  }

  eventCount(): number {
    return this.events.length;
  }
}
