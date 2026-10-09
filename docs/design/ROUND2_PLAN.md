# Round 2 plan (Phase C rework)

Input: the reference prototype (`reference/strecke-prototype-v2.html`) and the owner's round-1 findings F1–F4. Commits stay local; no push.

## Slices (in order)
1. **Engine** (`core/src/engine/`): eligibility per column set, thin-row hints, ranked distractors with an ambiguity guard and confusion priority, three new exercise types (Plural, Kollokation, Reihenfolge), run composition (seeded, ladder by FSRS state), run boundaries from the event log, four-step Karte rating. Vitest + a fixture sheet. `docs/ENGINE.md`.
2. **Run flow** (`app/`): tokens from the prototype in one place, three-zone layout, every exercise type in it, route line, flap, labelled exits only, summary, week view, self-hosted Barlow.
3. **Verlauf**: aggregates from the log (tested), one screen.
4. **Settings + audio**: grouped settings, `speak(text, key)` provider interface, device voice default, ElevenLabs with the user's own key (API facts verified against official docs), audio cache, export/import.
5. **Close-out**: licences (docs + Über), A1–A9 check, screenshots in `round2/`.

After each slice: typecheck, tests, PWA build, local commit.

## Risks
- Real-device behaviour (Android Chrome TTS, flap gesture, audio autoplay) cannot be judged here; checked in headless/emulated Chrome only.
- ElevenLabs terms/CORS may change; the provider is optional and failure falls back to the device voice.
- The old three-style review layers are removed; the prototype palette replaces them.
- Adding exercise types must not change the ladder gates, so replay of old logs stays identical (existing 295 tests guard this).
