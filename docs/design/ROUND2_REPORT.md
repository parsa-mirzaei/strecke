# Round 2 report

Local commits only; nothing pushed. Screenshots (synthetic demo deck, never the private seed): [round2/](round2/). Decisions and deviations: [DECISIONS.md](DECISIONS.md). Algorithm: [../ENGINE.md](../ENGINE.md).

## What changed
- **Engine** (`core/src/engine/`): eligibility per column set and thin-row hints; ranked distractors with an ambiguity guard and confusion priority; Plural, Kollokation and Reihenfolge added; seeded run composer on the hidden FSRS state; runs from the event log (id, else inactivity gap); dashboard aggregates; settings with export/import.
- **Run flow** (`app/`): three-zone layout on every exercise, route with per-stop grade colour, Karte with peelable flap and four-step self-rating, choice with fly-to-slot, typed, reorder, summary, calm end. Barlow self-hosted, one palette in `tokens.css`.
- **Verlauf**, grouped **Einstellungen** (Übungen, Audio, Daten, Darstellung, Ziele, Über) with `speak(text, key)` over device voice or ElevenLabs (own key, cache, cap, fallback).

## Acceptance criteria
| | Result | How it was checked |
| --- | --- | --- |
| A1 No card dismissed by swipe or accidental tap | pass | no swipe handlers exist outside the flap; the flap code is tested not to call next/answer; exits are *Weiter*, the four rating buttons and *Fertig* (`rules.test.ts`) |
| A2 Same three-zone layout on every type | pass | `Run` always renders header / card / actions; a scripted play-through of all 10 graded types checks the zones on each card (`node tools/app/shots.mjs --flow`) |
| A3 First-time user can say what / where / what next in 10 s | pass by self-review | each card names its exercise (kind label), the header says *Runde N · k von n* with the route, a one-line hint says what to do; screenshots at 390×844 and 320×600, light and dark, in `round2/`. Not tested with a real first-time user |
| A4 No streak, overdue, backlog, comparison, red | pass | test scans all app source and CSS for the words and for red values; contrast test fails on a red token. (`backlogPause` remains an internal engine config name in `core/`; it is never shown) |
| A5 Everything derives from sheet columns or the log | pass | test: no demo words in UI code; every number in Verlauf comes from `dashboard()` over the log |
| A6 Works offline after first load, incl. audio fallback | pass | headless Chrome: load build, wait for service worker, go offline, reload: card and fonts render (`--offline`); audio tests cover cache hit offline and device fallback |
| A7 Tests | pass | core 375 (295 existing + 80 new), app 70, typecheck, PWA build. One fixture in `scheduler.test.ts` was given distinct headwords and glosses; no assertion changed (R2-7) |
| A8 Licences in docs and Settings > Über | pass | `NOTICE.md`, `screens/licences.ts`, test that every font family and row is covered |
| A9 Hygiene | pass | privacy audit clean; key only in `localStorage`, only to `api.elevenlabs.io`, never logged or exported (tests); production CSP limits `connect-src`; no other host appears in source (test) |

## Deviations from the prototype
Listed in [DECISIONS.md](DECISIONS.md) ("Deviations"). Main ones: teal text, selected-state text and control borders darkened to reach WCAG AA; a hint line and exercise label on every card; *Weiß ich nicht* beside *Weiter* on every graded exercise; the week view is part of Verlauf.

## Open risks
- Judged only in headless Chrome here: flap drag feel, haptics, audio unlock after a tap, real voice quality and the 320 px layout on a real phone. These need the Android phone.
- ElevenLabs is called straight from the browser. CORS works today, but the docs do not promise it; failure falls back to the device voice.
- *Letzte Synchronisierung* is a placeholder: the `sheet` adapter is Phase E.
- Disabling a gate exercise (Lücke, Tippen, Zweiter Kontext) stops promotion for words at that stage (shown as a note in Settings).
- A first run on a sheet of new words is short (2–3 Karten), by the "start light" rule.
- Nothing was shown to a first-time user; A3 is a self-review.
